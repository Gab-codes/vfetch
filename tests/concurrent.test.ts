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
});
