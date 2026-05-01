import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Token Refresh Flow', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('should retry request when refresh is successful', async () => {
    // 1st call: returns 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    // 2nd call: returns 200 after refresh
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const onRefresh = vi.fn().mockResolvedValue('new-token');
    const onAuthFailure = vi.fn();

    let token = 'old-token';

    const client = createClient({
      baseURL: 'https://api.test.com',
      getToken: () => token,
      onRefresh: async () => {
        token = await onRefresh();
        return token;
      },
      onAuthFailure
    });

    const res = await client.get<{ success: boolean }>('/test');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.success).toBe(true);
    }
    
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Check that the second call has the new token
    const secondCallOpts = fetchMock.mock.calls[1][1] as RequestInit;
    expect(secondCallOpts).toBeDefined();
    if (secondCallOpts) {
      const headers = new Headers(secondCallOpts.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer new-token');
    }
  });

  it('should call onAuthFailure if refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    
    const onRefresh = vi.fn().mockResolvedValue(null);
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh,
      onAuthFailure
    });

    const res = await client.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
    }
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should handle request without refresh configured (no onRefresh)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    const onAuthFailure = vi.fn();
    const client = createClient({
      baseURL: 'https://api.test.com',
      onAuthFailure
      // no onRefresh
    });

    const res = await client.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('should call onAuthFailure if onRefresh throws an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    
    const onRefresh = vi.fn().mockRejectedValue(new Error('Refresh failed'));
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh,
      onAuthFailure
    });

    const res = await client.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
    }
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('should call onAuthFailure if retry request after refresh ALSO returns 401', async () => {
    // 1st call: returns 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    // 2nd call (retry): returns 401 again
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    const onRefresh = vi.fn().mockResolvedValue('invalid-new-token');
    const onAuthFailure = vi.fn();

    const client = createClient({
      baseURL: 'https://api.test.com',
      onRefresh,
      onAuthFailure
    });

    const res = await client.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
    }
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
