import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, FetchMock } from './utils';

describe('Hardening - Response Parsing', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  it('safely parses 204 No Content without crashing', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createClient({ baseURL: 'https://test.com' });
    const res = await client.get('/test');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe(204);
      expect(res.data).toEqual({});
    }
  });

  it('safely parses 200 OK with empty string without crashing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    const client = createClient({ baseURL: 'https://test.com' });
    const res = await client.get('/test');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe(200);
      expect(res.data).toEqual({});
    }
  });
});
