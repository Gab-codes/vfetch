export { VfetchClient } from "./client";
export * from "./types";
export { normalizeError } from "./errors";

import { VfetchClient } from "./client";
import { VfetchConfig } from "./types";

/**
 * Creates a new vfetch client instance with the given configuration.
 *
 * @param config - The client configuration (baseURL, auth, hooks, etc.)
 * @returns A configured VfetchClient instance
 *
 * @example
 * ```ts
 * const api = createClient({
 *   baseURL: "https://api.example.com",
 *   timeout: 5000,    // optional - request timeout in ms
 *   retry: 3,         // optional - retry network failures up to 3 times
 *   retryDelay: 1000,        // optional - delay between retries in ms
 * });
 *
 * // With type annotation (fully typed)
 * const result = await api.get<User[]>("/users");
 *
 * // Without type annotation (response.data defaults to 'any')
 * const result = await api.get("/users");
 * ```
 */
export function createClient(config: VfetchConfig): VfetchClient {
  return new VfetchClient(config);
}
