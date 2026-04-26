export interface VfetchConfig {
  baseURL: string;
  getToken?: () => string | null | Promise<string | null>;
  onRefresh?: () => Promise<string | null>;
  onAuthFailure?: () => void | Promise<void>;
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export type VfetchResponse<T> =
  | { data: T; status: number; ok: true }
  | { error: string; status: number; ok: false };
