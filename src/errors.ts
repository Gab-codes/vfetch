import { VfetchResponse } from "./types";

export async function normalizeError(
  error: unknown,
): Promise<VfetchResponse<never>> {
  if (error instanceof Response) {
    try {
      const body = await error.json();
      return {
        error:
          body?.message ||
          body?.error ||
          `Request failed with status ${error.status}`,
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

  if (error instanceof Error) {
    return {
      error: error.message,
      status: 0,
      ok: false,
    };
  }

  return {
    error: String(error) || "An unknown error occurred",
    status: 0,
    ok: false,
  };
}
