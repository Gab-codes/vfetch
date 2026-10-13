import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { withMockedFetch, FetchMock } from "./utils";

describe("Error Handling", () => {
  const client = createClient({ baseURL: "https://dummyjson.com" });

  it("should handle 404 correctly", async () => {
    await expect(client.get("/invalid-endpoint-12345")).rejects.toThrow();
    const safeRes = await client.safeGet("/invalid-endpoint-12345");
    expect(safeRes.ok).toBe(false);
    if (!safeRes.ok) {
      expect(safeRes.status).toBe(404);
      expect(safeRes.error).toBeDefined();
    }
  }, 15000);

  it("should handle network errors (e.g. invalid host)", async () => {
    const badClient = createClient({
      baseURL: "https://invalid-host-that-does-not-exist.local",
    });
    const res = await badClient.safeGet("/test");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(typeof res.error).toBe("string");
    }
  }, 15000);

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
});
