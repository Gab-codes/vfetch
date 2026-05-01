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
 *   timeout: 5000,
 *   retry: 3,
 * });
 *
 * const result = await api.get<User[]>("/users");
 * ```
 */
export function createClient(config: VfetchConfig): VfetchClient {
  return new VfetchClient(config);
}
