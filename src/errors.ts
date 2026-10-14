import { VfetchError } from "./types";

/**
 * Custom error class thrown by vfetch for all failures (HTTP, network, parsing).
 * Includes the HTTP status, a human-readable message (`error`) and — when
 * available — the original response payload (`data`).
 */
export class VfetchClientError<E = unknown> extends Error implements VfetchError<E> {
  public readonly ok = false as const;

  constructor(
    public readonly error: E,
    public readonly status: number,
    message?: string,
    /**
     * The original response payload when one could be captured
     * (parsed JSON body or raw text). `undefined` when unavailable
     * (network failures, empty bodies, ...).
     */
    public readonly data?: unknown
  ) {
    super(message || (typeof error === 'string' ? error : `Request failed with status ${status}`));
    this.name = 'VfetchClientError';
    // Restore prototype chain for instanceof checks in TS/ES5
    Object.setPrototypeOf(this, VfetchClientError.prototype);
  }
}

/**
 * Standardizes various error types into a consistent VfetchClientError object.
 * Handles HTTP Response objects, standard Error instances, and unknown values.
 *
 * For HTTP error responses the human-readable message is kept in `error`
 * (backwards compatible) while the original payload — parsed JSON or raw
 * text — is retained in `data` when available. Empty bodies yield
 * `data: undefined`. Plain-text / invalid-JSON bodies fall back to the
 * generic `Request failed with status <status>` message with the raw text
 * retained in `data`.
 *
 * Existing `VfetchClientError` instances are returned as-is (no rewrapping).
 *
 * @param error - The error to normalize (Response, Error, or unknown)
 * @returns A promise that resolves to a normalized VfetchClientError
 */
export async function normalizeError(
  error: unknown,
): Promise<VfetchClientError> {
  // Handle HTTP Response objects (non-ok responses)
  if (error instanceof Response) {
    const status = error.status;
    const fallback = `Request failed with status ${status}`;
    try {
      // Read as text once (avoids double-consuming the body and
      // handles empty / plain-text bodies gracefully).
      let text: string;
      try {
        text = await error.text();
      } catch {
        return new VfetchClientError(fallback, status, fallback);
      }
      if (!text) {
        return new VfetchClientError(fallback, status, fallback);
      }
      try {
        const body = JSON.parse(text) as unknown;
        if (body !== null && typeof body === "object") {
          const record = body as Record<string, unknown>;
          const message = String(
            (typeof record.message === "string" && record.message) ||
              (typeof record.error === "string" && record.error) ||
              fallback,
          );
          return new VfetchClientError(message, status, message, body);
        }
        // JSON primitive (string / number / ...): keep message compat,
        // retain the parsed value.
        if (typeof body === "string" && body) {
          return new VfetchClientError(body, status, body, body);
        }
        return new VfetchClientError(fallback, status, fallback, body);
      } catch {
        // Plain text or invalid JSON: keep the backwards-compatible
        // fallback message, retain the raw text for inspection.
        return new VfetchClientError(fallback, status, fallback, text);
      }
    } catch {
      return new VfetchClientError(fallback, status, fallback);
    }
  }

  if (error instanceof VfetchClientError) {
    return error;
  }

  // Handle standard Error objects (network errors, etc.)
  if (error instanceof Error) {
    return new VfetchClientError(error.message, 0, error.message);
  }

  // Fallback for unknown error types
  const message = typeof error === "string" ? error : "An unknown error occurred";
  return new VfetchClientError(message, 0, message);
}
