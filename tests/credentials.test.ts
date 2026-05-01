import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Credentials Support', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  it('defaults to "same-origin" when no credentials option is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({ baseURL: 'https://api.test.com' });
    await client.get('/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('same-origin');
  });

  it('uses global config credentials when provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({
      baseURL: 'https://api.test.com',
      credentials: 'include',
    });
    await client.get('/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('include');
  });

  it('overrides global credentials with per-request credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({
      baseURL: 'https://api.test.com',
      credentials: 'include',
    });
    
    // Per-request override
    await client.get('/test', { credentials: 'omit' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('omit');
  });

  it('allows headers and credentials to coexist without breaking Authorization injection', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({
      baseURL: 'https://api.test.com',
      credentials: 'include',
      getToken: () => 'test-token',
    });
    
    await client.get('/test', {
      headers: { 'X-Custom-Header': 'custom-value' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    
    expect(options.credentials).toBe('include');
    
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('maintains credentials during the retry / refresh flow', async () => {
    // 1st request fails with 401
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    // 2nd request (the refresh) succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'refreshed-token' }));
    // 3rd request (the retry) succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const onRefresh = vi.fn().mockImplementation(async () => {
      const res = await fetch('https://api.test.com/refresh', { method: 'POST' });
      const data = await res.json() as { token: string };
      return data.token;
    });

    const client = createClient({
      baseURL: 'https://api.test.com',
      credentials: 'include', // globally configured
      onRefresh,
    });

    await client.get('/protected');

    // 1 (initial get) + 1 (refresh inside onRefresh) + 1 (retry get)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Initial Request Options
    const initialOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(initialOptions.credentials).toBe('include');

    // Retry Request Options (index 2)
    const retryOptions = fetchMock.mock.calls[2][1] as RequestInit;
    expect(retryOptions.credentials).toBe('include');
    
    const retryHeaders = new Headers(retryOptions.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer refreshed-token');
  });
});
