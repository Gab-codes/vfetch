import { describe, it, expect } from 'vitest';
import { createClient } from '../src';
import { withMockedFetch, jsonResponse } from './utils';

describe('Query Parameters', () => {
  const client = createClient({ baseURL: 'https://api.test.com' });

  it('should append query parameters correctly', async () => {
    // Deterministic: echo back the requested pagination like DummyJSON does.
    const fetchMock = withMockedFetch();
    try {
      fetchMock.mockImplementation(async (input) => {
        const url = new URL(String(input));
        const limit = Number(url.searchParams.get('limit'));
        const skip = Number(url.searchParams.get('skip'));
        return jsonResponse({
          products: Array.from({ length: limit }, (_, i) => ({ id: skip + i + 1 })),
          total: 194,
          skip,
          limit,
        });
      });

      const res = await client.get<{ products: unknown[]; skip: number; limit: number }>('/products', {
        params: {
          limit: 5,
          skip: 10,
        }
      });
      expect(res.limit).toBe(5);
      expect(res.skip).toBe(10);
      expect(res.products.length).toBeLessThanOrEqual(5);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
