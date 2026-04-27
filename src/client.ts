import { normalizeError } from "./errors";
import { Interceptor } from "./interceptors";
import { RequestOptions, VfetchConfig, VfetchResponse } from "./types";

export class VfetchClient {
  private config: VfetchConfig;
  private interceptor: Interceptor;

  constructor(config: VfetchConfig) {
    this.config = config;
    this.interceptor = new Interceptor();
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

      await this.interceptor.beforeRequest(headers, this.config);

      const fetchOptions: RequestInit = {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      };

      const retryFn = async (newToken?: string) => {
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
        }
        return fetch(url.toString(), { ...fetchOptions, headers });
      };

      let response = await fetch(url.toString(), fetchOptions);

      response = await this.interceptor.afterResponse(
        response,
        this.config,
        retryFn,
      );

      if (!response.ok) {
        return await normalizeError(response);
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
        ok: true,
      };
    } catch (error) {
      return await normalizeError(error);
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
