# vfetch

<p align="center">
  A lightweight, Axios-like HTTP client built on native <code>fetch</code>.
  <br />
  Predictable. Concurrent-safe. Dependency-free.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/vfetch-client" />
  <img src="https://img.shields.io/npm/dm/vfetch-client" />
  <img src="https://img.shields.io/github/actions/workflow/status/Gab-Codes/vfetch/test.yml" />
  <img src="https://img.shields.io/badge/coverage-90%25-brightgreen" />
  <img src="https://img.shields.io/npm/l/vfetch-client" />
</p>

---

## âœ¨ Why vfetch?

Most HTTP clients fall into two extremes:

- **Axios** â†’ powerful but heavy and legacy-oriented
- **Ky** â†’ lightweight but limited for real-world auth flows

**vfetch sits in the middle.**

- Built directly on native `fetch`
- No dependencies
- Handles **token refresh + concurrency safely**
- Returns **predictable, non-throwing responses**

---

## ðŸ“¦ Installation

```bash
npm install vfetch-client
yarn add vfetch-client
pnpm add vfetch-client
bun add vfetch-client
```

---

## ðŸš€ Quick Start

```ts
import { createClient } from "vfetch-client";

const api = createClient({
  baseURL: "https://api.example.com",
});

  const users = await api.get<User[]>("/users");
  console.log(users);
  if (res.ok) {
  console.log(users);

    console.error(res.error);
  }
```

---

## ðŸ§  Core Response Model

The primary API returns data directly and throws on error. Use `safeGet`, `safePost`, etc. for non-throwing, discriminated union responses:

```ts
type VfetchResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string | Record<string, unknown>; status: number };
```

```ts
const result = await api.safeGet<User[]>("/users");
if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error, result.status);
}
```

---
## ðŸ§© TypeScript (Optional)

Typing is **completely optional**.

```ts
// No typing (default)
const res = await api.get("/users");

// Typed (when you know the shape)
const res = await api.get<User[]>("/users");
```

Types improve DX â€” they are not enforced at runtime.

---

## ðŸ”§ Request Methods

```ts
api.get("/users");

api.post("/users", { name: "John" });

api.put("/users/1", { status: "active" });

api.patch("/users/1", { role: "admin" });

api.delete("/users/1");
```

---

## ðŸ” Authentication & Token Refresh

vfetch handles token injection and **deduplicated refresh flows**.

If multiple requests fail with `401`, only **one refresh request runs**, while others wait safely.

```ts
let token = "initial-token";

const api = createClient({
  baseURL: "https://api.example.com",

  getToken: () => token,

  onRefresh: async () => {
    const res = await fetch("https://api.example.com/refresh", {
      method: "POST",
    });

    const data = await res.json();
    token = data.accessToken;

    return token;
  },

  onAuthFailure: () => {
    console.error("Session expired");
  },
});
```

---

## ðŸª Cookie-Based Authentication (Web)

vfetch supports cookie-based auth via the native `credentials` option.
The default behavior is `"same-origin"`.

This can be configured globally or per request.

### Example (Global)

```ts
const api = createClient({
  baseURL: "https://api.example.com",
  credentials: "include",
});
```

### Example (Per Request)

```ts
await api.get("/me", {
  credentials: "include",
});
```

### Important Note

For cross-origin requests using `credentials: "include"`, your backend must be explicitly configured to allow them.

You **cannot** use `Access-Control-Allow-Origin: *`.

Example backend CORS headers:

```http
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: https://your-frontend.com
```

---

## ðŸ”„ Interceptors

```ts
const api = createClient({
  baseURL: "https://api.example.com",

  onRequest: (url, options) => {
    console.log("â†’", options.method, url);
  },

  onResponse: (url, res, duration) => {
    console.log("â†", url, `${duration}ms`);
  },

  onError: (url, err) => {
    console.error("âœ•", url, err.error);
  },
});
```

---

## âš ï¸ Error Handling

Primary methods throw `VfetchClientError` on failure. You can catch and inspect the error:

```ts
import { VfetchClientError } from "vfetch-client";

try {
  const users = await api.get<User[]>("/users");
  console.log(users);
} catch (error) {
  if (error instanceof VfetchClientError) {
    console.error(error.status, error.error);
  }
}
```

Handles:

- 4xx / 5xx
- network failures
- invalid JSON
- timeouts
- aborted requests

---

## â±ï¸ Retry & Timeout

```ts
const api = createClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  retry: 2,
  retryDelay: 1000,
});
```

Override per request:

```ts
await api.get("/heavy", {
  retry: 0,
  timeout: 10000,
});
```

---

## ðŸ§µ Abort Requests

```ts
const controller = new AbortController();

const res = await api.get("/long-task", {
  signal: controller.signal,
});

controller.abort();
```

---

## TanStack Query (React Query)

vfetch works cleanly with TanStack Query. The throwing API is a natural fit - successful responses return the payload directly, and failures reject so TanStack Query can track errors properly.

---

### Queries

```ts
const { data, isError, error } = useQuery({
  queryKey: ["users"],
  queryFn: () => api.get<User[]>("/users"),
});
```

### Mutations

```ts
const { mutate } = useMutation({
  mutationFn: (identifier: string) => api.post("/auth/request-otp", { identifier }),
});
```

---
## Contributing

Contributions are welcome. Please read the [Contributing Guide](.github/CONTRIBUTING.md) before opening a PR.

---

## License

MIT [License](LICENSE.md)
