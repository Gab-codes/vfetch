import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, FetchMock } from './utils';

describe('JSON Parsing', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = withMockedFetch();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('should normalize error on invalid JSON response', async () => {
    // Returns 200 but body is invalid JSON
    fetchMock.mockResolvedValueOnce(new Response('this is not json', { status: 200 }));

    const client = createClient({ baseURL: 'https://api.test.com' });
    const res = await client.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(200);
      expect(typeof res.error).toBe('string');
      expect((res.error as string).toLowerCase()).toContain('failed to parse json response');
    }
  });
});
