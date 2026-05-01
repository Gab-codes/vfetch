import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Hardening - Retry System Correctness', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  it('aborted request never retries', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      callCount++;
      if ((init as RequestInit)?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      await new Promise(r => setTimeout(r, 10));
      throw new TypeError('Failed to fetch');
    });

    const client = createClient({ baseURL: 'https://test.com', retry: 5 });
    const controller = new AbortController();
    
    // Abort immediately
    controller.abort();

    const res = await client.get('/test', { signal: controller.signal });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    // Even with retry: 5, it should not have retried
    expect(callCount).toBe(1); // the initial attempt immediately throws AbortError
  });

  it('retry does not exceed configured maxRetries and count is exact', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async () => {
      callCount++;
      throw new Error('Network error');
    });

    const client = createClient({ baseURL: 'https://test.com', retry: 3 });
    const res = await client.get('/test');
    
    expect(res.ok).toBe(false);
    // 1 initial + 3 retries = 4 calls total
    expect(callCount).toBe(4);
  });
});
