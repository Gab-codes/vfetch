import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
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
    let capturedSignal: AbortSignal | undefined;
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
    let capturedSignal: AbortSignal | undefined;
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
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(async (_, init) => {
      capturedSignal = init?.signal;
      return jsonResponse({ success: true });
    });

    const client = createClient({ baseURL: "https://api.test.com", timeout: 5000 });
    await client.safeGet("/test"); // no user signal

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("should return undefined when neither userSignal nor timeout", async () => {
    let capturedSignal: AbortSignal | undefined;
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
});