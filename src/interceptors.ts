import { VfetchConfig } from "./types";

export class Interceptor {
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

  async afterResponse(
    response: Response,
    config: VfetchConfig,
    retry: (newToken?: string) => Promise<Response>,
  ): Promise<Response> {
    if (response.status !== 401) {
      return response;
    }

    if (config.onRefresh) {
      try {
        const newToken = await config.onRefresh();

        if (newToken) {
          const retryResponse = await retry(newToken);
          return retryResponse;
        }
      } catch (error) {
        // Refresh failed, trigger auth failure
        if (config.onAuthFailure) {
          await config.onAuthFailure();
        }
        // Return the original 401 response
        return response;
      }
    }

    // No refresh handler, trigger auth failure if provided
    if (config.onAuthFailure) {
      await config.onAuthFailure();
    }

    return response;
  }
}
