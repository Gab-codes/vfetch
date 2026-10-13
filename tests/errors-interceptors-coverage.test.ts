import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { VfetchClientError } from "../src/errors";
import { withMockedFetch, jsonResponse, FetchMock } from "./utils";

describe("Errors - VfetchClientError fallback message", () => {
  it("should use fallback message when error is not a string and no message provided", () => {
    // This tests line 15 in errors.ts: `Request failed with status ${status}`
    const error = new VfetchClientError({ code: "ERR_UNKNOWN" }, 500);
    expect(error.message).toBe("Request failed with status 500");
    expect(error.error).toEqual({ code: "ERR_UNKNOWN" });
    expect(error.status).toBe(500);
  });

  it("should use error as message when error is a string and no message provided", () => {
    const error = new VfetchClientError("Custom error message", 400);
    expect(error.message).toBe("Custom error message");
    expect(error.error).toBe("Custom error message");
  });

  it("should use provided message over error", () => {
    const error = new VfetchClientError({ code: "ERR" }, 500, "Explicit message");
    expect(error.message).toBe("Explicit message");
  });
});

describe("Interceptors - onAuthFailure branches", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("should call onAuthFailure when no onRefresh is configured and 401 received", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const onAuthFailure = vi.fn();
    const client = createClient({
      baseURL: "https://api.test.com",
      onAuthFailure,
      // no onRefresh
    });

    const res = await client.safeGet("/protected");

    expect(res.ok).toBe(false);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("should call onAuthFailure when onRefresh returns null", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const onRefresh = vi.fn().mockResolvedValue(null);
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: "https://api.test.com",
      onRefresh,
      onAuthFailure,
    });

    const res = await client.safeGet("/protected");

    expect(res.ok).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("should call onAuthFailure when retry after refresh also returns 401", async () => {
    // Initial 401
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    // Refresh endpoint called by onRefresh
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: "new-token" }));
    // Retry request: also returns 401
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const onRefresh = vi.fn().mockImplementation(async () => {
      const res = await fetch("https://api.test.com/refresh");
      const data = (await res.json()) as { token: string };
      return data.token;
    });
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: "https://api.test.com",
      onRefresh,
      onAuthFailure,
    });

    const res = await client.safeGet("/protected");

    expect(res.ok).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should call onAuthFailure when onRefresh throws", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const onRefresh = vi.fn().mockRejectedValue(new Error("Refresh failed"));
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: "https://api.test.com",
      onRefresh,
      onAuthFailure,
    });

    const res = await client.safeGet("/protected");

    expect(res.ok).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});