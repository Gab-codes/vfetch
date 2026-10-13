import { VfetchError } from "./types";

/**
 * Custom error class thrown by vfetch for all failures (HTTP, network, parsing).
 * Includes the HTTP status and the parsed error payload.
 */
export class VfetchClientError<E = unknown> extends Error implements VfetchError<E> {
  public readonly ok = false as const;

  constructor(
    public readonly error: E,
    public readonly status: number,
    message?: string
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
 * @param error - The error to normalize (Response, Error, or unknown)
 * @returns A promise that resolves to a normalized VfetchClientError
 */
export async function normalizeError(
  error: unknown,
): Promise<VfetchClientError> {
  // Handle HTTP Response objects (non-ok responses)
  if (error instanceof Response) {
    try {
      const body = await error.json() as Record<string, unknown>;
      const message = String(
        body?.message || body?.error || `Request failed with status ${error.status}`,
      );
      return new VfetchClientError(message, error.status, message);
    } catch {
      const message = `Request failed with status ${error.status}`;
      return new VfetchClientError(message, error.status, message);
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
