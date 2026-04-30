import { VfetchConfig } from "./types";

const HTTP_UNAUTHORIZED = 401;

/**
 * Handles internal logic for request and response transformations,
 * specifically authentication token attachment and automatic refresh.
 */
export class Interceptor {
  private refreshCount = 0;
  private readonly maxRefreshAttempts = 1;

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
   */
  async afterResponse(
    response: Response,
    config: VfetchConfig,
    retry: (newToken?: string) => Promise<Response>,
  ): Promise<Response> {
    if (response.status !== HTTP_UNAUTHORIZED) {
      this.refreshCount = 0;
      return response;
    }

    if (this.refreshCount >= this.maxRefreshAttempts) {
      this.refreshCount = 0; // Reset for future requests
      if (config.onAuthFailure) {
        await config.onAuthFailure();
      }
      return response;
    }

    if (config.onRefresh) {
      try {
        this.refreshCount++;
        const newToken = await config.onRefresh();

        if (newToken) {
          const retryResponse = await retry(newToken);

          if (retryResponse.status === HTTP_UNAUTHORIZED) {
            if (config.onAuthFailure) {
              await config.onAuthFailure();
            }
            return retryResponse;
          }

          this.refreshCount = 0;
          return retryResponse;
        }
      } catch {
        this.refreshCount = 0;
        if (config.onAuthFailure) {
          await config.onAuthFailure();
        }

        return response;
      }
    }

    this.refreshCount = 0;
    if (config.onAuthFailure) {
      await config.onAuthFailure();
    }

    return response;
  }
}
