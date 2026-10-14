import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { VfetchClientError } from "../src/errors";
import { withMockedFetch, FetchMock } from "./utils";

describe("Hardening - Retry System Correctness", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it("aborted request never retries", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      callCount++;
      if ((init as RequestInit)?.signal?.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      await new Promise((r) => setTimeout(r, 10));
      throw new TypeError("Failed to fetch");
    });

    const client = createClient({ baseURL: "https://test.com", retry: 5 });
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    const res = await client.safeGet("/test", { signal: controller.signal });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    // Even with retry: 5, it should not have retried
    expect(callCount).toBe(1); // the initial attempt immediately throws AbortError
  });

  it("retry does not exceed configured maxRetries and count is exact", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async () => {
      callCount++;
      throw new Error("Network error");
    });

    const client = createClient({ baseURL: "https://test.com", retry: 3 });
    const res = await client.safeGet("/test");

    expect(res.ok).toBe(false);
    // 1 initial + 3 retries = 4 calls total
    expect(callCount).toBe(4);
  });

  it("never retries HTTP errors or parse failures", async () => {
    fetchMock.mockResolvedValue(new Response("err", { status: 500 }));

    const httpClient = createClient({ baseURL: "https://test.com", retry: 3, retryDelay: 5 });
    await expect(httpClient.safeGet("/x")).resolves.toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response("{{{bad", { status: 200 }));

    const parseClient = createClient({ baseURL: "https://test.com", retry: 3 });
    await expect(parseClient.get("/x")).rejects.toBeInstanceOf(VfetchClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("per-request retry overrides the global default", async () => {
    fetchMock.mockRejectedValue(new Error("down"));

    const client = createClient({ baseURL: "https://test.com", retry: 5 });
    await client.safeGet("/x", { retry: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("already-aborted signals reject without retrying", async () => {
    fetchMock.mockImplementation(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    const client = createClient({ baseURL: "https://test.com", retry: 4 });
    const controller = new AbortController();
    controller.abort();

    const res = await client.safeGet("/x", { signal: controller.signal });

    expect(res).toMatchObject({ ok: false, status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborting during the retry delay rejects instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new Error("down"));

      const client = createClient({ baseURL: "https://test.com", retry: 3, retryDelay: 5000 });
      const controller = new AbortController();
      const pending = client.safeGet("/x", { signal: controller.signal });

      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(5000);

      const res = await pending;
      expect(res.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("timeouts reject deterministically with fake timers", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async (_input, init) => {
        await new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal)?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
        return new Response("never", { status: 200 });
      });

      const client = createClient({ baseURL: "https://test.com", timeout: 100 });
      const pending = client.safeGet("/x");
      await vi.advanceTimersByTimeAsync(150);

      await expect(pending).resolves.toMatchObject({
        ok: false,
        status: 0,
        error: "Request timed out",
      });
    } finally {
      vi.useRealTimers();
    }
  });

});
