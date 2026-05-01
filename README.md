# vfetch

<p align="center">
  A lightweight, Axios-like HTTP client built on native <code>fetch</code>.
  <br />
  Predictable. Concurrent-safe. Dependency-free.
</p>

<p align="center">
  <!-- Replace these with your actual links -->
  <img src="https://img.shields.io/npm/v/vfetch" />
  <img src="https://img.shields.io/npm/dm/vfetch" />
  <img src="https://img.shields.io/github/actions/workflow/status/YOUR_GITHUB_USERNAME/vfetch/test.yml" />
  <img src="https://img.shields.io/badge/coverage-87%25-brightgreen" />
  <img src="https://img.shields.io/npm/l/vfetch" />
</p>

---

## ✨ Why vfetch?

Most HTTP clients fall into two extremes:

- **Axios** → powerful but heavy and legacy-oriented
- **Ky** → lightweight but limited for real-world auth flows

**vfetch sits in the middle.**

- Built directly on native `fetch`
- No dependencies
- Handles **token refresh + concurrency safely**
- Returns **predictable, non-throwing responses**

---

## 📦 Installation

```bash
npm install vfetch
yarn add vfetch
pnpm add vfetch
bun add vfetch
```

---

## 🚀 Quick Start

```ts
import { createClient } from "vfetch";

const api = createClient({
  baseURL: "https://api.example.com",
});

const res = await api.get("/users");

if (res.ok) {
  console.log(res.data);
} else {
  console.error(res.error);
}
```

---

## 🧠 Core Response Model

vfetch never throws HTTP errors. Everything resolves into a consistent shape:

```ts
type VfetchResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };
```

This removes the need for excessive `try/catch` and keeps control flow predictable.

---

## 🧩 TypeScript (Optional)

Typing is **completely optional**.

```ts
// No typing (default)
const res = await api.get("/users");

// Typed (when you know the shape)
const res = await api.get<User[]>("/users");
```

Types improve DX — they are not enforced at runtime.

---

## 🔧 Request Methods

```ts
api.get("/users");

api.post("/users", { name: "John" });

api.put("/users/1", { status: "active" });

api.patch("/users/1", { role: "admin" });

api.delete("/users/1");
```

---

## 🔐 Authentication & Token Refresh

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

## 🍪 Cookie-Based Authentication (Web)

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

## 🔄 Interceptors

```ts
const api = createClient({
  baseURL: "https://api.example.com",

  onRequest: (url, options) => {
    console.log("→", options.method, url);
  },

  onResponse: (url, res, duration) => {
    console.log("←", url, `${duration}ms`);
  },

  onError: (url, err) => {
    console.error("✕", url, err.error);
  },
});
```

---

## ⚠️ Error Handling

No thrown HTTP errors:

```ts
const res = await api.get("/users");

if (!res.ok) {
  console.error(res.status, res.error);
  return;
}

console.log(res.data);
```

Handles:

- 4xx / 5xx
- network failures
- invalid JSON
- timeouts
- aborted requests

---

## ⏱️ Retry & Timeout

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

## 🧵 Abort Requests

```ts
const controller = new AbortController();

const res = await api.get("/long-task", {
  signal: controller.signal,
});

controller.abort();
```

---

## ⚛️ TanStack Query (React Query)

vfetch works cleanly with TanStack Query.

---

### Queries

#### Pattern A — Clean abstraction

```ts
export const getUsersFn = async () => {
  return api.get("/users");
};
```

```ts
const { data } = useQuery({
  queryKey: ["users"],
  queryFn: getUsersFn,
});
```

---

#### Pattern B — Inline

```ts
const { data } = useQuery({
  queryKey: ["users"],
  queryFn: async () => {
    return api.get("/users");
  },
});
```

---

### Mutations

#### Named function

```ts
export const resendOtpFn = async (identifier: string) => {
  return api.post("/auth/request-otp", { identifier });
};
```

```ts
const { mutate } = useMutation({
  mutationFn: resendOtpFn,
});
```

---

#### Inline mutation

```ts
const { mutate } = useMutation({
  mutationFn: async (identifier: string) => {
    return api.post("/auth/request-otp", { identifier });
  },
});
```

---

## 🧭 Design Philosophy

- **Transport layer only**
  No schema validation, no assumptions about backend structure

- **Predictable responses**
  No hidden throws — always `{ ok, data | error }`

- **Concurrency safety first**
  Token refresh, retries, and interceptors behave correctly under load

- **Minimal & dependency-free**
  Built directly on native `fetch`

---

## ⚖️ vfetch vs Axios vs Ky

| Feature                | vfetch | Axios   | Ky              |
| ---------------------- | ------ | ------- | --------------- |
| Built on fetch         | ✅     | ❌      | ✅              |
| Zero dependencies      | ✅     | ❌      | ✅              |
| Interceptors           | ✅     | ✅      | ⚠️ (hooks only) |
| Token refresh flow     | ✅     | manual  | ❌              |
| TypeScript-first       | ✅     | partial | ✅              |
| Response normalization | ✅     | ❌      | partial         |
| Lightweight            | ✅     | ❌      | ✅              |

### Summary

- **Axios** → mature, but heavier and more legacy-oriented
- **Ky** → minimal, but lacks structured auth + retry control
- **vfetch** → modern balance with safer concurrency and predictable responses

---

## 📄 License

MIT
