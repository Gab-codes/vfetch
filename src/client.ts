import { normalizeError } from "./errors";
import { Interceptor } from "./interceptors";
import { RequestOptions, VfetchConfig, VfetchResponse, VfetchError } from "./types";

/** Default number of retry attempts for network failures. */
const DEFAULT_RETRY_COUNT = 0;

/** Default delay between retry attempts in milliseconds. */
const DEFAULT_RETRY_DELAY_MS = 0;

/**
 * Type augmentation for environments supporting AbortSignal.any().
 * Available in modern browsers and Node.js 20+.
 */
interface AbortSignalConstructorWithAny {
  any(signals: AbortSignal[]): AbortSignal;
}

/**
 * Combines multiple AbortSignals so that aborting any one of them
 * aborts the combined signal. Uses AbortSignal.any() when available,
 * falls back to manual event listener wiring.
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const ctor = AbortSignal as unknown as AbortSignalConstructorWithAny;
  if ("any" in AbortSignal && typeof ctor.any === "function") {
    return ctor.any(signals);
  }

  // Manual fallback
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }

  const onAbort = () => {
    const abortedSignal = signals.find((s) => s.aborted);
    controller.abort(abortedSignal?.reason);
    for (const signal of signals) {
      signal.removeEventListener("abort", onAbort);
    }
  };

  for (const signal of signals) {
    signal.addEventListener("abort", onAbort);
  }

  return controller.signal;
}

/**
 * The main client class for making HTTP requests.
 * Provides a standardized interface with built-in interceptors,
 * retries, timeouts, and lifecycle hooks.
 */
export class VfetchClient {
  private readonly config: VfetchConfig;
  private readonly interceptor: Interceptor;

  constructor(config: VfetchConfig) {
    this.config = config;
    this.interceptor = new Interceptor();
  }

  /**
   * Internal request handler that implements the full request lifecycle.
   */
  private async request<T>(
    path: string,
    options: RequestOptions & {
      method: string;
      body?: unknown;
    },
  ): Promise<VfetchResponse<T>> {
    const {
      method,
      params,
      headers: requestHeaders,
      body,
      timeout: requestTimeout,
      signal: userSignal,
      retry: requestRetry,
      retryDelay: requestRetryDelay,
    } = options;

    const maxRetries = requestRetry ?? this.config.retry ?? DEFAULT_RETRY_COUNT;
    const retryDelay = requestRetryDelay ?? this.config.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    const timeout = requestTimeout ?? this.config.timeout;

    let attempt = 0;

    const executeRequest = async (): Promise<VfetchResponse<T>> => {
      const startTime = Date.now();
      const url = this.buildUrl(path, params);
      const headers = this.buildHeaders(requestHeaders);

      await this.interceptor.beforeRequest(headers, this.config);

      // Setup AbortController for timeout
      const timeoutController = timeout ? new AbortController() : null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      if (timeoutController && timeout) {
        timeoutId = setTimeout(() => {
          timeoutController.abort("Request timed out");
        }, timeout);
      }

      const finalSignal = this.resolveSignal(userSignal, timeoutController);

      const fetchOptions: RequestInit = {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
        signal: finalSignal,
      };

      const urlString = url.toString();

      // Lifecycle Hook: onRequest
      this.safeInvokeHook(() => this.config.onRequest?.(urlString, fetchOptions));

      try {
        const retryFn = async (newToken?: string) => {
          if (newToken) {
            headers.set("Authorization", `Bearer ${newToken}`);
          }
          return fetch(urlString, { ...fetchOptions, headers });
        };

        let response = await fetch(urlString, fetchOptions);

        response = await this.interceptor.afterResponse(
          response,
          this.config,
          retryFn,
        );

        this.clearScheduledTimeout(timeoutId);

        const durationMs = Date.now() - startTime;

        if (!response.ok) {
          const errorResponse = await normalizeError(response);
          this.safeInvokeHook(() => this.config.onError?.(urlString, errorResponse));
          return errorResponse;
        }

        const data = await response.json() as T;

        // Lifecycle Hook: onResponse
        this.safeInvokeHook(() => this.config.onResponse?.(urlString, response, durationMs));

        return { data, status: response.status, ok: true };

      } catch (error) {
        this.clearScheduledTimeout(timeoutId);

        // Check if error is due to AbortSignal (timeout or manual cancellation)
        if (error instanceof Error && error.name === "AbortError") {
          const isTimeout = timeoutController?.signal.aborted === true;
          const abortError: VfetchError = {
            ok: false,
            error: isTimeout ? "Request timed out" : "Request was cancelled",
            status: 0,
          };
          this.safeInvokeHook(() => this.config.onError?.(urlString, abortError));
          return abortError;
        }

        // Network failure — potentially retry
        if (attempt < maxRetries) {
          attempt++;
          if (retryDelay > 0) {
            await this.delay(retryDelay);
          }
          return executeRequest();
        }

        const normalizedError = await normalizeError(error);
        this.safeInvokeHook(() => this.config.onError?.(urlString, normalizedError));
        return normalizedError;
      }
    };

    return executeRequest();
  }

  /** Builds the full URL from the path and optional query parameters. */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): URL {
    // Ensure baseURL ends with a slash and path DOES NOT start with a slash 
    // to combine them correctly without stripping the baseURL's path.
    const normalizedBase = this.config.baseURL.endsWith("/")
      ? this.config.baseURL
      : `${this.config.baseURL}/`;
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

    const url = new URL(normalizedPath, normalizedBase);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url;
  }

  /** Merges default JSON content-type, global config headers, and per-request headers. */
  private buildHeaders(requestHeaders?: Record<string, string>): Headers {
    return new Headers({
      "Content-Type": "application/json",
      ...this.config.headers,
      ...requestHeaders,
    });
  }

  /** Resolves the final AbortSignal from an optional user signal and timeout controller. */
  private resolveSignal(
    userSignal?: AbortSignal,
    timeoutController?: AbortController | null,
  ): AbortSignal | undefined {
    if (userSignal && timeoutController) {
      return combineAbortSignals([userSignal, timeoutController.signal]);
    }
    return userSignal ?? timeoutController?.signal;
  }

  /** Clears a scheduled timeout if it exists. */
  private clearScheduledTimeout(timeoutId: ReturnType<typeof setTimeout> | null): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

  /** Returns a promise that resolves after the given number of milliseconds. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Safely invokes a lifecycle hook. Hook errors are silently ignored. */
  private safeInvokeHook(hook: () => void): void {
    try {
      hook();
    } catch {
      // Silently ignore — hooks must never break the request lifecycle
    }
  }

  /**
   * Sends a GET request.
   * @template T The expected response data type
   * @param path - The URL path relative to baseURL
   * @param options - Optional request configuration
   */
  async get<T>(path: string, options?: RequestOptions): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  /**
   * Sends a POST request.
   * @template T The expected response data type
   * @param path - The URL path relative to baseURL
   * @param body - The request body, serialized as JSON
   * @param options - Optional request configuration
   */
  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  /**
   * Sends a PATCH request.
   * @template T The expected response data type
   * @param path - The URL path relative to baseURL
   * @param body - The request body, serialized as JSON
   * @param options - Optional request configuration
   */
  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  /**
   * Sends a PUT request.
   * @template T The expected response data type
   * @param path - The URL path relative to baseURL
   * @param body - The request body, serialized as JSON
   * @param options - Optional request configuration
   */
  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }

  /**
   * Sends a DELETE request.
   * @template T The expected response data type
   * @param path - The URL path relative to baseURL
   * @param options - Optional request configuration
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<VfetchResponse<T>> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}
