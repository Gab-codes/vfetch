import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Hardening - Concurrency Safety', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  it('handles 10 concurrent requests with refresh, only ONE refresh call, all wait', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;
    
    fetchMock.mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url.includes('/refresh')) {
        refreshCalls++;
        await new Promise(r => setTimeout(r, 20));
        return jsonResponse({ token: 'new-token' });
      }
      
      endpointCalls++;
      const headers = new Headers((init as any)?.headers);
      if (headers.get('Authorization') === 'Bearer new-token') {
        return jsonResponse({ success: true });
      }
      return new Response('Unauthorized', { status: 401 });
    });

    const onRefresh = vi.fn().mockImplementation(async () => {
      const res = await fetch('https://test.com/refresh');
      const data = await res.json() as any;
      return data.token;
    });

    const client = createClient({
      baseURL: 'https://test.com',
      onRefresh
    });

    const promises = Array.from({ length: 10 }).map((_, i) => client.get('/test/' + i));
    const results = await Promise.all(promises);

    expect(results.every(r => r.ok)).toBe(true);
    // 10 initial fails + 10 retries = 20 endpoint calls
    expect(endpointCalls).toBe(20);
    expect(refreshCalls).toBe(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
