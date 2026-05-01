import { VfetchConfig } from "./types";

const HTTP_UNAUTHORIZED = 401;

/**
 * Handles internal logic for request and response transformations,
 * specifically authentication token attachment and automatic refresh.
 */
export class Interceptor {
  /** In-flight refresh promise, used to deduplicate concurrent 401 refreshes. */
  private refreshPromise: Promise<string | null | undefined> | null = null;

  /**
   * Automatically attaches bearer tokens to request headers if a getToken helper is provided.
   */
  async beforeRequest(
    headers: Headers,
    config: VfetchConfig,
  ): Promise<Headers> {
    if (config.getToken) {
      const token = await config.getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    return headers;
  }

  /**
   * Handles 401 Unauthorized responses by attempting a token refresh.
   * Concurrent 401s are deduplicated — only one refresh call is made,
   * and all waiting requests retry with the new token.
   */
  async afterResponse(
    response: Response,
    config: VfetchConfig,
    retry: (newToken?: string) => Promise<Response>,
  ): Promise<Response> {
    if (response.status !== HTTP_UNAUTHORIZED) {
      return response;
    }

    // No refresh handler configured — nothing we can do
    if (!config.onRefresh) {
      if (config.onAuthFailure) {
        await config.onAuthFailure();
      }
      return response;
    }

    // If a refresh is already in-flight, wait for it instead of starting another
    if (this.refreshPromise) {
      try {
        const newToken = await this.refreshPromise;
        if (newToken) {
          return retry(newToken);
        }
      } catch {
        // The primary refresh already failed and called onAuthFailure
      }
      return response;
    }

    // Start a new refresh — store the promise so concurrent 401s can share it
    try {
      this.refreshPromise = config.onRefresh();
      const newToken = await this.refreshPromise;

      if (!newToken) {
        if (config.onAuthFailure) {
          await config.onAuthFailure();
        }
        return response;
      }

      const retryResponse = await retry(newToken);

      // If the retried request ALSO returns 401, the refreshed token is invalid
      if (retryResponse.status === HTTP_UNAUTHORIZED) {
        if (config.onAuthFailure) {
          await config.onAuthFailure();
        }
        return retryResponse;
      }

      return retryResponse;
    } catch {
      if (config.onAuthFailure) {
        await config.onAuthFailure();
      }
      return response;
    } finally {
      this.refreshPromise = null;
    }
  }
}
