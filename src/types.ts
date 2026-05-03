/**
 * Represents a successful response from vfetch.
 * @template T The type of the data returned by the server.
 */
export interface VfetchSuccess<T = any> {
  /** Indicates the request was successful. */
  readonly ok: true;
  /** The parsed JSON data from the response. */
  readonly data: T;
  /** The HTTP status code of the response. */
  readonly status: number;
}

/**
 * Represents an error response from vfetch.
 * @template E The type of the error payload. Defaults to `string`.
 */
export interface VfetchError<E = string | Record<string, any>> {
  /** Indicates the request failed. */
  readonly ok: false;
  /** The error payload — typically a human-readable message string. */
  readonly error: E;
  /** The HTTP status code (0 for network/timeout errors). */
  readonly status: number;
}

/**
 * The union type of all possible vfetch responses.
 */
export type VfetchResponse<T = any> = VfetchSuccess<T> | VfetchError;

/**
 * Configuration options for the vfetch client instance.
 */
export interface VfetchConfig {
  /** The base URL to which relative paths will be appended. */
  readonly baseURL: string;
  /** Global default timeout in milliseconds. If omitted, no timeout is applied. */
  readonly timeout?: number;
  /** Global default headers to be sent with every request. */
  readonly headers?: Record<string, string>;
  /** Global default retry attempts for network failures. Default is 0. */
  readonly retry?: number;
  /** Delay in milliseconds between retry attempts. Default is 0. */
  readonly retryDelay?: number;
  /**
   * The request credentials to be sent with the request.
   * Default is "same-origin".
   */
  readonly credentials?: RequestCredentials;
  /**
   * Function to retrieve the authentication token.
   * Can be synchronous or asynchronous.
   */
  readonly getToken?: () =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;
  /**
   * Function called when a 401 Unauthorized response is received.
   * Should return the new access token.
   */
  readonly onRefresh?: () => Promise<string | null | undefined>;
  /**
   * Function called if authentication fails after refresh attempts.
   */
  readonly onAuthFailure?: () => void | Promise<void>;
  /**
   * Hook called just before a fetch request is made.
   * Useful for logging or debugging.
   */
  readonly onRequest?: (url: string, options: RequestInit) => void;
  /**
   * Hook called after a successful response is received.
   * Includes the total duration of the request.
   */
  readonly onResponse?: (
    url: string,
    response: Response,
    durationMs: number,
  ) => void;
  /**
   * Hook called whenever a request returns an error (ok: false).
   */
  readonly onError?: (url: string, error: VfetchError) => void;
}

/**
 * Options for an individual request.
 */
export interface RequestOptions {
  /** Query parameters to be appended to the URL. */
  readonly params?: Record<string, string | number | boolean | undefined>;
  /** Request-specific headers. Merged with global headers. */
  readonly headers?: Record<string, string>;
  /** Request-specific timeout in milliseconds. Overrides global timeout. */
  readonly timeout?: number;
  /** Optional AbortSignal to cancel the request externally. */
  readonly signal?: AbortSignal;
  /** Request-specific retry attempts. Overrides global retry. */
  readonly retry?: number;
  /** Request-specific retry delay. Overrides global retryDelay. */
  readonly retryDelay?: number;
  /** Request-specific credentials. Overrides global credentials. */
  readonly credentials?: RequestCredentials;
}
