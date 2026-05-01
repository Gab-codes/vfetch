import { MockInstance, vi } from 'vitest';

export type FetchInput = RequestInfo | URL;
export type FetchInit = RequestInit;
export type FetchMock = MockInstance<typeof fetch>;

export function withMockedFetch(): FetchMock {
  const mock = vi.fn();
  vi.stubGlobal('fetch', mock);
  return mock as unknown as FetchMock;
}

export function jsonResponse<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    ...init
  });
}
