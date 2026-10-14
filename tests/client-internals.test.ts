import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { VfetchClientError } from "../src/errors";
import { withMockedFetch, jsonResponse, FetchMock } from "./utils";

describe("Client Internals - combineAbortSignals Fallback", () => {
  let fetchMock: FetchMock;
  let originalAbortSignalAny: typeof AbortSignal.any | undefined;

  beforeEach(() => {
    fetchMock = withMockedFetch();
    // Mock AbortSignal.any to be undefined to force fallback path
    originalAbortSignalAny = AbortSignal.any;
    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    // Restore AbortSignal.any
    if (originalAbortSignalAny !== undefined) {
      Object.defineProperty(AbortSignal, "any", {
        value: originalAbortSignalAny,
        configurable: true,
      });
    } else {
      delete (AbortSignal as any).any;
    }
  });

  it("should use manual fallback when AbortSignal.any is not available", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({ baseURL: "https://api.test.com", timeout: 1000 });
    const res = await client.safeGet("/test");

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should combine user signal and timeout signal via fallback", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      capturedSignal = init?.signal;
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com", timeout: 1000 });
    const controller = new AbortController();
    await client.safeGet("/test", { signal: controller.signal });

    expect(capturedSignal).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should abort immediately if user signal is already aborted in fallback", async () => {
    fetchMock.mockImplementationOnce(async (_, init) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com", timeout: 1000 });
    const controller = new AbortController();
    controller.abort();

    const res = await client.safeGet("/test", { signal: controller.signal });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Request was cancelled");
      expect(res.status).toBe(0);
    }
  });
});

describe("Client Internals - resolveSignal", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should return userSignal when only userSignal is provided (no timeout)", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      capturedSignal = init?.signal;
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com" }); // no timeout
    const controller = new AbortController();
    await client.safeGet("/test", { signal: controller.signal });

    expect(capturedSignal).toBe(controller.signal);
  });

  it("should return timeoutController.signal when only timeout is configured", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      capturedSignal = init?.signal;
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com", timeout: 5000 });
    await client.safeGet("/test"); // no user signal

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("should return undefined when neither userSignal nor timeout", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      capturedSignal = init?.signal;
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com" }); // no timeout
    await client.safeGet("/test"); // no user signal

    expect(capturedSignal).toBeUndefined();
  });
});

describe("Client Internals - buildUrl branches", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should handle baseURL that already ends with slash", async () => {
    let capturedUrl: string | undefined;
    fetchMock.mockImplementationOnce(async (input) => {
      capturedUrl = input.toString();
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com/" }); // ends with slash
    await client.safeGet("test"); // path without leading slash

    expect(capturedUrl).toBe("https://api.test.com/test");
  });

  it("should handle path that does not start with slash", async () => {
    let capturedUrl: string | undefined;
    fetchMock.mockImplementationOnce(async (input) => {
      capturedUrl = input.toString();
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com" }); // no trailing slash
    await client.safeGet("test"); // path without leading slash

    expect(capturedUrl).toBe("https://api.test.com/test");
  });

  it("should skip undefined param values", async () => {
    let capturedUrl: string | undefined;
    fetchMock.mockImplementationOnce(async (input) => {
      capturedUrl = input.toString();
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com" });
    await client.safeGet("/test", {
      params: {
        defined: "value",
        undefinedParam: undefined,
        alsoDefined: 123,
      },
    });

    expect(capturedUrl).toBe("https://api.test.com/test?defined=value&alsoDefined=123");
  });
});

describe("Client Internals - retryFn newToken branch", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should inject new token in retryFn during refresh retry", async () => {
    // First request: 401
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    // Refresh endpoint called by onRefresh
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: "refreshed-token" }));
    // Retry request: should have new token
    let retryHeaders: Headers | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      retryHeaders = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
      return jsonResponse({ success: true });
    });

    let token = "old-token";
    const onRefresh = vi.fn().mockImplementation(async () => {
      const res = await fetch("https://api.test.com/refresh");
      const data = (await res.json()) as { token: string };
      token = data.token;
      return token;
    });

    const client = createClient({
      baseURL: "https://api.test.com",
      getToken: () => token,
      onRefresh,
    });

    const res = await client.safeGet("/protected");
    expect(res.ok).toBe(true);

    // Verify the retry request has the new token
    expect(retryHeaders).toBeDefined();
    if (retryHeaders) {
      expect(retryHeaders.get("Authorization")).toBe("Bearer refreshed-token");
    }
  });
});

describe("Primary Methods - post, patch, put, delete", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should perform POST request and return data directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Created" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const data = await client.post<{ id: number; title: string }>("/posts", { title: "Created" });

    expect(data.id).toBe(1);
    expect(data.title).toBe("Created");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ method: "POST" });
  });

  it("should perform PATCH request and return data directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Patched" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const data = await client.patch<{ id: number; title: string }>("/posts/1", { title: "Patched" });

    expect(data.id).toBe(1);
    expect(data.title).toBe("Patched");
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ method: "PATCH" });
  });

  it("should perform PUT request and return data directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Updated" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const data = await client.put<{ id: number; title: string }>("/posts/1", { title: "Updated" });

    expect(data.id).toBe(1);
    expect(data.title).toBe("Updated");
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ method: "PUT" });
  });

  it("should perform DELETE request and return data directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, deleted: true }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const data = await client.delete<{ id: number; deleted: boolean }>("/posts/1");

    expect(data.id).toBe(1);
    expect(data.deleted).toBe(true);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ method: "DELETE" });
  });

  it("should throw on POST failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    await expect(client.post("/posts", { title: "Test" })).rejects.toThrow();
  });

  it("should throw on PATCH failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    await expect(client.patch("/posts/1", { title: "Test" })).rejects.toThrow();
  });

  it("should throw on PUT failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    await expect(client.put("/posts/1", { title: "Test" })).rejects.toThrow();
  });

  it("should throw on DELETE failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    await expect(client.delete("/posts/1")).rejects.toThrow();
  });
});

describe("Safe Methods - safePost, safePatch, safePut, safeDelete", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should return ok response for safePost", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Created" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePost<{ id: number; title: string }>("/posts", { title: "Created" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.title).toBe("Created");
      expect(res.status).toBe(200);
    }
  });

  it("should return error response for safePost on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePost("/posts", { title: "Test" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toBeDefined();
    }
  });

  it("should return ok response for safePatch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Patched" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePatch<{ id: number; title: string }>("/posts/1", { title: "Patched" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.title).toBe("Patched");
    }
  });

  it("should return error response for safePatch on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePatch("/posts/1", { title: "Test" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
    }
  });

  it("should return ok response for safePut", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Updated" }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePut<{ id: number; title: string }>("/posts/1", { title: "Updated" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.title).toBe("Updated");
    }
  });

  it("should return error response for safePut on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePut("/posts/1", { title: "Test" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
    }
  });

  it("should return ok response for safeDelete", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, deleted: true }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safeDelete<{ id: number; deleted: boolean }>("/posts/1");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.deleted).toBe(true);
    }
  });

  it("should return error response for safeDelete on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safeDelete("/posts/1");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
    }
  });

  it("should handle network error in safePost", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safePost("/posts", { title: "Test" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(res.error).toBe("Network failure");
    }
  });

  it("should handle network error in safeDelete", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safeDelete("/posts/1");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(res.error).toBe("Network failure");
    }
  });

describe("API Contract - throwing vs safe methods", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it.each(["get", "post", "put", "patch", "delete"] as const)(
    "primary %s returns the payload directly on success (not a wrapper)",
    async (method) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ hello: "world" }, { status: 201 }));

      const client = createClient({ baseURL: "https://api.test.com" });
      const result =
        method === "get" || method === "delete"
          ? await (client[method] as (p: string) => Promise<unknown>)("/items")
          : await (client[method] as (p: string, b: unknown) => Promise<unknown>)("/items", {
              a: 1,
            });

      expect(result).toEqual({ hello: "world" });
      expect(result).not.toHaveProperty("ok");
    },
  );

  it.each(["get", "post", "put", "patch", "delete"] as const)(
    "primary %s rejects with VfetchClientError on HTTP errors",
    async (method) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "boom" }), { status: 422 }),
      );

      const client = createClient({ baseURL: "https://api.test.com" });
      const call =
        method === "get" || method === "delete"
          ? () => (client[method] as (p: string) => Promise<unknown>)("/items")
          : () => (client[method] as (p: string, b: unknown) => Promise<unknown>)("/items", {
              a: 1,
            });

      await expect(call()).rejects.toBeInstanceOf(VfetchClientError);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "boom" }), { status: 422 }),
      );
      await expect(call()).rejects.toMatchObject({ status: 422 });
    },
  );

  it.each(["get", "post", "put", "patch", "delete"] as const)(
    "primary %s rejects on network failures and malformed JSON",
    async (method) => {
      const client = createClient({ baseURL: "https://api.test.com" });
      const call =
        method === "get" || method === "delete"
          ? () => (client[method] as (p: string) => Promise<unknown>)("/items")
          : () => (client[method] as (p: string, b: unknown) => Promise<unknown>)("/items", {
              a: 1,
            });

      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(call()).rejects.toMatchObject({ status: 0 });

      fetchMock.mockResolvedValueOnce(new Response("not-json{{{", { status: 200 }));
      await expect(call()).rejects.toBeInstanceOf(VfetchClientError);
    },
  );

  it.each(["safeGet", "safePost", "safePut", "safePatch", "safeDelete"] as const)(
    "safe %s normalizes success and failure without rejecting",
    async (method) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      const client = createClient({ baseURL: "https://api.test.com" });
      const ok =
        method === "safeGet" || method === "safeDelete"
          ? await (client[method] as (p: string) => Promise<{ ok: boolean; status: number }>)(
              "/items",
            )
          : await (
              client[method] as (p: string, b: unknown) => Promise<{ ok: boolean; status: number }>
            )("/items", { a: 1 });

      expect(ok).toMatchObject({ ok: true, status: 200 });

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "bad" }), { status: 400 }),
      );
      const fail =
        method === "safeGet" || method === "safeDelete"
          ? await (client[method] as (p: string) => Promise<{ ok: boolean; status: number }>)(
              "/items",
            )
          : await (
              client[method] as (p: string, b: unknown) => Promise<{ ok: boolean; status: number }>
            )("/items", { a: 1 });

      expect(fail.ok).toBe(false);
      expect(fail.status).toBe(400);
    },
  );

  it("safe methods never reject for ordinary HTTP/network failures", async () => {
    const client = createClient({ baseURL: "https://api.test.com" });

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(client.safeGet("/a")).resolves.toMatchObject({ ok: false, status: 500 });

    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expect(client.safeGet("/a")).resolves.toMatchObject({ ok: false, status: 0 });
  });

  it("hook errors never convert failures into successes", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ m: "no" }), { status: 500 }));

    const client = createClient({
      baseURL: "https://api.test.com",
      onError: () => {
        throw new Error("hook blew up");
      },
    });

    await expect(client.get("/x")).rejects.toBeInstanceOf(VfetchClientError);
  });
});

});