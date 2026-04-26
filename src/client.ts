import { normalizeError } from "./errors";
import { RequestOptions, VfetchConfig, VfetchResponse } from "./types";

export class VfetchClient {
  private config: VfetchConfig;

  constructor(config: VfetchConfig) {
    this.config = config;
  }

  private async request<T>(
    path: string,
    options: RequestOptions & {
      method: string;
      body?: Record<string, unknown> | unknown[];
    },
  ): Promise<VfetchResponse<T>> {
    try {
      const url = new URL(path, this.config.baseURL);

      if (options.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.append(key, String(value));
          }
        });
      }

      const headers = new Headers({
        "Content-Type": "application/json",
        ...options.headers,
      });

      if (this.config.getToken) {
        const token = await this.config.getToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }

      const response = await fetch(url.toString(), {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        return normalizeError(response);
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
        ok: true,
      };
    } catch (error) {
      return normalizeError(error);
    }
  }

  async get<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown> | unknown[],
    options?: RequestOptions,
  ): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }
  async patch<T>(
    path: string,
    body?: Record<string, unknown> | unknown[],
    options?: RequestOptions,
  ): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  async put<T>(
    path: string,
    body?: Record<string, unknown> | unknown[],
    options?: RequestOptions,
  ): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }

  async delete<T>(
    path: string,
    options?: RequestOptions,
  ): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}
