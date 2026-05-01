import { describe, it, expect } from 'vitest';
import { createClient } from '../src';

describe('Query Parameters', () => {
  const client = createClient({ baseURL: 'https://dummyjson.com' });

  it('should append query parameters correctly', async () => {
    const res = await client.get<{ products: unknown[]; skip: number; limit: number }>('/products', {
      params: {
        limit: 5,
        skip: 10,
      }
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.limit).toBe(5);
      expect(res.data.skip).toBe(10);
      expect(res.data.products.length).toBeLessThanOrEqual(5);
    }
  }, 15000);
});
