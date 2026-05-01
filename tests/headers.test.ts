import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse, FetchMock } from './utils';

describe('Headers Handling', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('should merge global and request headers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({
      baseURL: 'https://api.test.com',
      headers: {
        'X-Global': 'global-value',
        'X-Shared': 'from-global'
      }
    });

    await client.get('/test', {
      headers: {
        'X-Request': 'request-value',
        'X-Shared': 'from-request'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    
    expect(options).toBeDefined();
    if (options) {
      const headers = new Headers(options.headers as HeadersInit);
      expect(headers.get('X-Global')).toBe('global-value');
      expect(headers.get('X-Request')).toBe('request-value');
      expect(headers.get('X-Shared')).toBe('from-request');
      expect(headers.get('Content-Type')).toBe('application/json');
    }
  });

  it('should inject authorization header if getToken is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const client = createClient({
      baseURL: 'https://api.test.com',
      getToken: () => 'my-secret-token'
    });

    await client.get('/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs[1] as RequestInit;

    expect(options).toBeDefined();
    if (options) {
      const headers = new Headers(options.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer my-secret-token');
    }
  });
});
