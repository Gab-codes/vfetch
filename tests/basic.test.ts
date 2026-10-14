import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { withMockedFetch, jsonResponse, FetchMock } from "./utils";

const PRODUCT = { id: 1, title: "Essence Mascara Lash Princess" };

// Contract: the primary throwing API returns the raw payload directly.
// These mirror the DummyJSON product shapes but run against a local mock
// so they stay deterministic when the live API is unreachable.

describe("Basic Requests (primary throwing API)", () => {
  const client = createClient({ baseURL: "https://api.test.com" });
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("GET returns the raw product payload directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PRODUCT));
    const product = await client.get<{ id: number; title: string }>("/products/1");

    // Raw payload — not a VfetchResponse wrapper
    expect(product).not.toHaveProperty("ok");
    expect(product.id).toBe(1);
    expect(product.title).toBe(PRODUCT.title);
  });

  it("POST returns the created product payload directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 195, title: "Test Product" }, { status: 201 }));
    const created = await client.post<{ id: number; title: string }>("/products/add", {
      title: "Test Product",
    });

    expect(created).not.toHaveProperty("ok");
    expect(created.id).toBe(195);
    expect(created.title).toBe("Test Product");
  });

  it("PATCH returns the patched product payload directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Patched Product" }));
    const patched = await client.patch<{ id: number; title: string }>("/products/1", {
      title: "Patched Product",
    });

    expect(patched).not.toHaveProperty("ok");
    expect(patched.id).toBe(1);
    expect(patched.title).toBe("Patched Product");
  });

  it("PUT returns the updated product payload directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, title: "Updated Product" }));
    const updated = await client.put<{ id: number; title: string }>("/products/1", {
      title: "Updated Product",
    });

    expect(updated).not.toHaveProperty("ok");
    expect(updated.id).toBe(1);
    expect(updated.title).toBe("Updated Product");
  });

  it("DELETE returns the deleted product payload directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, isDeleted: true }));
    const deleted = await client.delete<{ id: number; isDeleted: boolean }>("/products/1");

    expect(deleted).not.toHaveProperty("ok");
    expect(deleted.id).toBe(1);
    expect(deleted.isDeleted).toBe(true);
  });
});

describe("Basic Requests (safe non-throwing API)", () => {
  const client = createClient({ baseURL: "https://api.test.com" });
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("safeGet resolves to a success wrapper for existing products", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PRODUCT));
    const res = await client.safeGet<{ id: number }>("/products/1");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.status).toBe(200);
    }
  });

  it("safeGet normalizes a 404 without rejecting", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
    const res = await client.safeGet("/invalid-endpoint-12345");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toBeDefined();
    }
  });
});
