import { describe, it, expect } from "vitest";
import { createClient } from "../../src";
import type {
  VfetchResponse,
  VfetchSuccess,
  VfetchError,
} from "../../src/types";

// ============================================
// Type guards (kept, but adapted)
// ============================================

function assertSuccess<T>(
  res: VfetchResponse<T>,
): asserts res is VfetchSuccess<T> {
  if (!res.ok) {
    throw new Error(`Expected success: ${res.error} (${res.status})`);
  }
}

function assertError<T>(res: VfetchResponse<T>): asserts res is VfetchError {
  if (res.ok) {
    throw new Error("Expected error but got success");
  }
}

// ============================================
// Utils
// ============================================

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type FetchMock = (input: FetchInput, init?: FetchInit) => Promise<Response>;

async function withMockedFetch<T>(
  mock: FetchMock,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================
// TEST SUITE
// ============================================

describe("vFetch Client", () => {
  // --------------------------------------------
  // Basic Requests
  // --------------------------------------------
  it("should handle basic CRUD requests", async () => {
    const api = createClient({
      baseURL: "https://dummyjson.com",
    });

    const product = await api.get<{ id: number }>("/products/1");
    assertSuccess(product);
    expect(product.data.id).toBe(1);

    const created = await api.post<{ title: string }>("/products/add", {
      title: "Test",
    });
    assertSuccess(created);
    expect(created.data.title).toBe("Test");

    const updated = await api.put<{ title: string }>("/products/1", {
      title: "Updated",
    });
    assertSuccess(updated);
    expect(updated.data.title).toBe("Updated");

    const deleted = await api.delete<{ isDeleted: boolean }>("/products/1");
    assertSuccess(deleted);
    expect(deleted.data.isDeleted).toBe(true);
  });

  // --------------------------------------------
  // Query Params
  // --------------------------------------------
  it("should handle query parameters correctly", async () => {
    const api = createClient({
      baseURL: "https://dummyjson.com",
    });

    const res = await api.get<{ products: unknown[] }>("/products", {
      params: { limit: "2", skip: "1" },
    });

    assertSuccess(res);
    expect(res.data.products.length).toBeLessThanOrEqual(2);
  });

  // --------------------------------------------
  // Header + Token Injection
  // --------------------------------------------
  it("should merge headers and inject auth token", async () => {
    let capturedAuth: string | null = null;

    await withMockedFetch(
      async (_, init) => {
        const headers =
          init?.headers instanceof Headers
            ? init.headers
            : new Headers(init?.headers);

        capturedAuth = headers.get("Authorization");

        return jsonResponse({ ok: true });
      },
      async () => {
        const api = createClient({
          baseURL: "https://x.com",
          getToken: () => "abc123",
        });

        const res = await api.get("/test", {
          headers: { "X-Test": "1" },
        });

        assertSuccess(res);
      },
    );

    expect(capturedAuth).toBe("Bearer abc123");
  });

  // --------------------------------------------
  // Error Handling
  // --------------------------------------------
  it("should normalize errors correctly", async () => {
    const api = createClient({
      baseURL: "https://dummyjson.com",
    });

    const res = await api.get("/nonexistent");

    assertError(res);
    expect(res.status).toBe(404);
  });

  // --------------------------------------------
  // Refresh Flow
  // --------------------------------------------
  it("should refresh token and retry request", async () => {
    let token = "expired";
    let refreshCalls = 0;

    await withMockedFetch(
      async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.endsWith("/refresh")) {
          refreshCalls++;
          token = "fresh";
          return jsonResponse({ accessToken: token });
        }

        if (url.endsWith("/me")) {
          const headers =
            init?.headers instanceof Headers
              ? init.headers
              : new Headers(init?.headers);

          const auth = headers.get("Authorization");

          if (auth === "Bearer fresh") {
            return jsonResponse({ id: 1 });
          }

          return jsonResponse({}, 401);
        }

        return jsonResponse({}, 404);
      },
      async () => {
        const api = createClient({
          baseURL: "https://api.test",
          getToken: () => token,
          onRefresh: async () => {
            const res = await fetch("https://api.test/refresh");
            const data = (await res.json()) as { accessToken?: string };
            token = data.accessToken ?? "";
            return token;
          },
        });

        const res = await api.get<{ id: number }>("/me");

        assertSuccess(res);
        expect(res.data.id).toBe(1);
        expect(refreshCalls).toBe(1);
      },
    );
  });

  // --------------------------------------------
  // Concurrent Refresh
  // --------------------------------------------
  it("should dedupe refresh calls under concurrency", async () => {
    let token = "expired";
    let refreshCalls = 0;

    await withMockedFetch(
      async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.endsWith("/refresh")) {
          refreshCalls++;
          await delay(50);
          token = "fresh";
          return jsonResponse({ accessToken: token });
        }

        if (url.endsWith("/me")) {
          const headers =
            init?.headers instanceof Headers
              ? init.headers
              : new Headers(init?.headers);

          const auth = headers.get("Authorization");

          if (auth === "Bearer fresh") {
            return jsonResponse({ id: 1 });
          }

          return jsonResponse({}, 401);
        }

        return jsonResponse({}, 404);
      },
      async () => {
        const api = createClient({
          baseURL: "https://api.test",
          getToken: () => token,
          onRefresh: async () => {
            const res = await fetch("https://api.test/refresh");
            const data = (await res.json()) as { accessToken?: string };
            token = data.accessToken ?? "";
            return token;
          },
        });

        const results = await Promise.all([
          api.get("/me"),
          api.get("/me"),
          api.get("/me"),
        ]);

        expect(results.every((r) => r.ok)).toBe(true);
        expect(refreshCalls).toBe(1);
      },
    );
  });

  // --------------------------------------------
  // Invalid JSON
  // --------------------------------------------
  it("should handle invalid JSON safely", async () => {
    await withMockedFetch(
      async () => new Response("invalid-json", { status: 200 }),
      async () => {
        const api = createClient({
          baseURL: "https://x.com",
        });

        const res = await api.get("/test");

        assertError(res);
      },
    );
  });
});
