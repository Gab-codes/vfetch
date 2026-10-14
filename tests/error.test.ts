import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "../src";
import { VfetchClientError, normalizeError } from "../src/errors";
import { withMockedFetch, FetchMock } from "./utils";

describe("Error Handling", () => {
  const client = createClient({ baseURL: "https://api.test.com" });
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should handle 404 correctly", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
    const err = await client.get("/invalid-endpoint-12345").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VfetchClientError);
    expect((err as VfetchClientError).status).toBe(404);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
    const safeRes = await client.safeGet("/invalid-endpoint-12345");
    expect(safeRes.ok).toBe(false);
    if (!safeRes.ok) {
      expect(safeRes.status).toBe(404);
      expect(safeRes.error).toBeDefined();
    }
  });

  it("should handle network errors (e.g. invalid host)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const badClient = createClient({
      baseURL: "https://invalid-host-that-does-not-exist.local",
    });
    const res = await badClient.safeGet("/test");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(typeof res.error).toBe("string");
    }
  });

  describe("Mocked Error Edge Cases", () => {
    let fetchMock: FetchMock;

    beforeEach(() => {
      fetchMock = withMockedFetch();
    });

    afterEach(() => {
      fetchMock.mockRestore();
    });

    it("should retry on network error and respect retry limit", async () => {
      fetchMock.mockRejectedValue(new Error("Network failure"));

      const client = createClient({
        baseURL: "https://api.test.com",
        retry: 2,
        retryDelay: 10, // small delay for fast test
      });

      const res = await client.safeGet("/test");

      expect(res.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      if (!res.ok) {
        expect(res.status).toBe(0);
        expect(res.error).toBe("Network failure");
      }
    });

    it("should handle HTTP error with empty body", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const client = createClient({ baseURL: "https://api.test.com" });
      let err: any;
      try {
        await client.get("/test");
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.status).toBe(500);
      expect(err.error).toContain("Request failed with status 500");
    });

    it("should handle HTTP error with non-JSON body (string + fallback)", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Server Error String", { status: 500 }),
      );

      const client = createClient({ baseURL: "https://api.test.com" });
      let err: any;
      try {
        await client.get("/test");
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.status).toBe(500);
      expect(err.error).toContain("Request failed with status 500");
    });

    it("should handle network timeout or cancellation using AbortSignal", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      fetchMock.mockRejectedValueOnce(abortError);

      const client = createClient({ baseURL: "https://api.test.com" });
      const controller = new AbortController();
      controller.abort();

      let err: any;
      try {
        await client.get("/test", { signal: controller.signal });
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.error).toBe("Request was cancelled");
      expect(err.status).toBe(0);
    });

    it("should capture unknown error types safely (string)", async () => {
      fetchMock.mockRejectedValueOnce("Some weird string error");

      const client = createClient({ baseURL: "https://api.test.com" });
      let err: any;
      try {
        await client.get("/test");
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.error).toBe("Some weird string error");
    });

    it("should capture unknown error types safely (non-string)", async () => {
      fetchMock.mockRejectedValueOnce({ weird: "object" });

      const client = createClient({ baseURL: "https://api.test.com" });
      let err: any;
      try {
        await client.get("/test");
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.error).toBe("An unknown error occurred");
    });

    it("should handle request timeout", async () => {
      fetchMock.mockImplementationOnce(async (input, init) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if ((init as RequestInit)?.signal?.aborted) {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        }
        return new Response("ok");
      });

      const client = createClient({ baseURL: "https://api.test.com" });
      const res = await client.safeGet("/test", { timeout: 10 }); // 10ms timeout

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Request timed out");
        expect(res.status).toBe(0);
      }
    });

    it("should handle JSON error body without message or error properties", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ weirdField: true }), { status: 400 }),
      );

      const client = createClient({ baseURL: "https://api.test.com" });
      let err: any;
      try {
        await client.get("/test");
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      const res = err;
      expect(err.error).toBe("Request failed with status 400");
      expect(err.status).toBe(400);
    });
  });

describe("Error Normalization - payload retention", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("thrown errors extend Error and pass instanceof checks", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 500 }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const err: unknown = await client.get("/x").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VfetchClientError);
    expect((err as VfetchClientError).name).toBe("VfetchClientError");
  });

  it("retains structured JSON payloads in data", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid", code: "E1" }), { status: 422 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const err = (await client.get("/x").catch((e: unknown) => e)) as VfetchClientError;

    expect(err.error).toBe("Invalid");
    expect(err.data).toEqual({ message: "Invalid", code: "E1" });
  });

  it("retains raw text for plain-text error bodies", async () => {
    fetchMock.mockResolvedValueOnce(new Response("plain boom", { status: 503 }));

    const client = createClient({ baseURL: "https://api.test.com" });
    const err = (await client.get("/x").catch((e: unknown) => e)) as VfetchClientError;

    expect(err.status).toBe(503);
    expect(err.data).toBe("plain boom");
  });

  it("falls back gracefully for non-string message fields while keeping the payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { nested: true } }), { status: 400 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const err = (await client.get("/x").catch((e: unknown) => e)) as VfetchClientError;

    expect(err.error).toBe("Request failed with status 400");
    expect(err.data).toEqual({ message: { nested: true } });
  });

  it("does not rewrap existing VfetchClientError instances", async () => {
    const original = new VfetchClientError("same", 418, "same", { a: 1 });

    await expect(normalizeError(original)).resolves.toBe(original);
  });

  it("emits onError exactly once per HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));

    const onError = vi.fn();
    const client = createClient({ baseURL: "https://api.test.com", onError });

    await expect(client.get("/x")).rejects.toBeInstanceOf(VfetchClientError);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("safe methods preserve HTTP error detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "detail here" }), { status: 400 }),
    );

    const client = createClient({ baseURL: "https://api.test.com" });
    const res = await client.safeGet("/x");

    expect(res).toMatchObject({ ok: false, status: 400, error: "detail here" });
  });
});

});
