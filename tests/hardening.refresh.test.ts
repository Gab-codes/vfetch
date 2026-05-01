import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Hardening - Refresh Robustness', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  it('failed refresh triggers onAuthFailure exactly once for a burst of requests', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response('Unauthorized', { status: 401 });
    });

    const onAuthFailure = vi.fn();
    const onRefresh = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20));
      return null; // refresh failed!
    });

    const client = createClient({
      baseURL: 'https://test.com',
      onRefresh,
      onAuthFailure
    });

    // Fire 5 concurrent requests
    const promises = Array.from({ length: 5 }).map(() => client.get('/test'));
    const results = await Promise.all(promises);

    expect(results.every(r => !r.ok)).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    
    // The core issue to harden: onAuthFailure should only be called ONCE per refresh burst
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});
