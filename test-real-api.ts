import { createClient } from "./src/index";
import type { VfetchResponse, VfetchSuccess, VfetchError } from "./src/types";

// ============================================
// Assertion helpers (STRICT)
// ============================================

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSuccess<T>(
  res: VfetchResponse<T>,
  message?: string,
): asserts res is VfetchSuccess<T> {
  if (!res.ok) {
    throw new Error(
      message ?? `Expected success but got error: ${res.error} (${res.status})`,
    );
  }
}

function assertError<T>(
  res: VfetchResponse<T>,
  message?: string,
): asserts res is VfetchError {
  if (res.ok) {
    throw new Error(message ?? "Expected error but got success");
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
// TEST 1: Basic Requests
// ============================================

async function testBasicRequests() {
  console.log("\n=== Test 1: Basic Requests ===");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  const product = await api.get<{ id: number }>("/products/1");
  assertSuccess(product);
  assert(product.data.id === 1, "GET failed");

  const created = await api.post<{ title: string }>("/products/add", {
    title: "Test",
  });
  assertSuccess(created);
  assert(created.data.title === "Test", "POST failed");

  const updated = await api.put<{ title: string }>("/products/1", {
    title: "Updated",
  });
  assertSuccess(updated);
  assert(updated.data.title === "Updated", "PUT failed");

  const deleted = await api.delete<{ isDeleted: boolean }>("/products/1");
  assertSuccess(deleted);
  assert(deleted.data.isDeleted === true, "DELETE failed");

  console.log("✅ Basic requests OK");
}

// ============================================
// TEST 2: Query Params
// ============================================

async function testQueryParams() {
  console.log("\n=== Test 2: Query Params ===");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  const res = await api.get<{ products: unknown[] }>("/products", {
    params: { limit: "2", skip: "1" },
  });

  assertSuccess(res);
  assert(res.data.products.length <= 2, "Query params failed");

  console.log("✅ Query params OK");
}

// ============================================
// TEST 3: Header + Token Injection
// ============================================

async function testHeaderMerging() {
  console.log("\n=== Test 3: Header merging ===");

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

  assert(capturedAuth === "Bearer abc123", "Auth header not merged correctly");

  console.log("✅ Header merge OK");
}

// ============================================
// TEST 4: Error Normalization
// ============================================

async function testErrorHandling() {
  console.log("\n=== Test 4: Error handling ===");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  const res = await api.get("/nonexistent");

  assertError(res);
  assert(res.status === 404, "Expected 404");

  console.log("✅ Error normalization OK");
}

// ============================================
// TEST 5: Refresh Flow (REAL EDGE)
// ============================================

async function testRefreshFlow() {
  console.log("\n=== Test 5: Refresh flow ===");

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

        return jsonResponse({ message: "Unauthorized" }, 401);
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
        onAuthFailure: () => {
          throw new Error("Auth failure triggered");
        },
      });

      const res = await api.get<{ id: number }>("/me");

      assertSuccess(res);
      assert(res.data.id === 1, "Retry after refresh failed");
      assert(refreshCalls === 1, "Refresh should be called once");
    },
  );

  console.log("✅ Refresh flow OK");
}

// ============================================
// TEST 6: Concurrent Refresh Deduping
// ============================================

async function testConcurrentRefresh() {
  console.log("\n=== Test 6: Concurrent refresh ===");

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

      assert(
        results.every((r) => r.ok),
        "All should succeed",
      );
      assert(refreshCalls === 1, "Refresh must be deduped");
    },
  );

  console.log("✅ Concurrent refresh OK");
}

// ============================================
// TEST 7: Invalid JSON
// ============================================

async function testInvalidJSON() {
  console.log("\n=== Test 7: Invalid JSON ===");

  await withMockedFetch(
    async () => {
      return new Response("invalid-json", { status: 200 });
    },
    async () => {
      const api = createClient({
        baseURL: "https://x.com",
      });

      const res = await api.get("/test");

      assertError(res, "Should fail on invalid JSON");
    },
  );

  console.log("✅ Invalid JSON handled");
}

// ============================================
// RUNNER
// ============================================

async function runAllTests() {
  console.log("🚀 Running vFetch test suite\n");

  await testBasicRequests();
  await testQueryParams();
  await testHeaderMerging();
  await testErrorHandling();
  await testRefreshFlow();
  await testConcurrentRefresh();
  await testInvalidJSON();

  console.log("\n✅ ALL TESTS PASSED — client is solid");
}

runAllTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
