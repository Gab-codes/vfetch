import { describe, it, expect } from 'vitest';
import { createClient } from '../src';

describe('Error Handling', () => {
  const client = createClient({ baseURL: 'https://dummyjson.com' });

  it('should handle 404 correctly', async () => {
    const res = await client.get('/this-path-does-not-exist-12345');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toBeDefined();
    }
  }, 15000);

  it('should handle network errors (e.g. invalid host)', async () => {
    const badClient = createClient({ baseURL: 'https://invalid-host-that-does-not-exist.local' });
    const res = await badClient.get('/test');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(0);
      expect(typeof res.error).toBe('string');
    }
  }, 15000);
});
