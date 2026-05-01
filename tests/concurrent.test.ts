import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Concurrent Requests Refresh Deduplication', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('should deduplicate concurrent refresh calls', async () => {
    // 3 concurrent calls all fail with 401 initially
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    
    // then all 3 retry and succeed
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3 }));

    const onRefresh = vi.fn().mockImplementation(async () => {
      // Simulate some delay to allow concurrent requests to queue up
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'new-token';
    });

    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh
    });

    // Fire 3 requests concurrently
    const [res1, res2, res3] = await Promise.all([
      client.get<{ id: number }>('/test/1'),
      client.get<{ id: number }>('/test/2'),
      client.get<{ id: number }>('/test/3')
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res3.ok).toBe(true);
    
    // Very important: onRefresh should only be called ONCE
    expect(onRefresh).toHaveBeenCalledTimes(1);
    
    // total fetch calls should be 6 (3 initial + 3 retries)
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('should clear refresh promise so subsequent requests can trigger a new refresh', async () => {
    // 1. Initial request fails with 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    
    // 2. Refresh is triggered and fails
    const onRefresh = vi.fn().mockRejectedValueOnce(new Error('Refresh failed'));
    
    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh
    });

    // First request
    const res1 = await client.get('/test');
    expect(res1.ok).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // 3. Second request later fails with 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    // 4. Refresh is triggered and succeeds this time
    onRefresh.mockResolvedValueOnce('new-token');
    // 5. Retry succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2 }));

    const res2 = await client.get<{ id: number }>('/test');
    expect(res2.ok).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(2); // Should be called again!
  });

  it('should share in-flight refresh promise and catch its failure without unhandled rejections', async () => {
    // 2 concurrent calls fail with 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    
    // Refresh is triggered and fails
    const onRefresh = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw new Error('Refresh completely failed');
    });

    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh
    });

    const [res1, res2] = await Promise.all([
      client.get('/test/1'),
      client.get('/test/2')
    ]);

    expect(res1.ok).toBe(false);
    expect(res2.ok).toBe(false);
    expect(onRefresh).toHaveBeenCalledTimes(1); // Still deduplicated
  });
});
