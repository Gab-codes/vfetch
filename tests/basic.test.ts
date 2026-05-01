import { describe, it, expect } from 'vitest';
import { createClient } from '../src';

describe('Basic Requests', () => {
  const client = createClient({ baseURL: 'https://dummyjson.com' });

  it('should perform GET request', async () => {
    const res = await client.get<{ id: number }>('/products/1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.status).toBe(200);
    }
  }, 15000);

  it('should perform POST request', async () => {
    const res = await client.post<{ id: number; title: string }>('/products/add', { title: 'Test Product' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBeDefined();
      expect(res.data.title).toBe('Test Product');
      // POST might return 200 or 201
      expect([200, 201]).toContain(res.status);
    }
  }, 15000);

  it('should perform PUT request', async () => {
    const res = await client.put<{ id: number; title: string }>('/products/1', { title: 'Updated Product' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.title).toBe('Updated Product');
    }
  }, 15000);

  it('should perform DELETE request', async () => {
    const res = await client.delete<{ id: number; isDeleted: boolean }>('/products/1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(1);
      expect(res.data.isDeleted).toBe(true);
    }
  }, 15000);
});
