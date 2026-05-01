import { VfetchError } from "./types";

/**
 * Standardizes various error types into a consistent VfetchError object.
 * Handles HTTP Response objects, standard Error instances, and unknown values.
 *
 * @param error - The error to normalize (Response, Error, or unknown)
 * @returns A promise that resolves to a normalized VfetchError
 */
export async function normalizeError(
  error: unknown,
): Promise<VfetchError> {
  // Handle HTTP Response objects (non-ok responses)
  if (error instanceof Response) {
    try {
      const body = await error.json() as Record<string, unknown>;
      return {
        error: String(
          body?.message || body?.error || `Request failed with status ${error.status}`,
        ),
        status: error.status,
        ok: false,
      };
    } catch {
      return {
        error: `Request failed with status ${error.status}`,
        status: error.status,
        ok: false,
      };
    }
  }

  // Handle standard Error objects (network errors, etc.)
  if (error instanceof Error) {
    return {
      error: error.message,
      status: 0,
      ok: false,
    };
  }

  // Fallback for unknown error types
  return {
    error: typeof error === "string" ? error : "An unknown error occurred",
    status: 0,
    ok: false,
  };
}
