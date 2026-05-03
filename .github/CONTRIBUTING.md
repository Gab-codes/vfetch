# 📄 `CONTRIBUTING.md`

````md
# Contributing to vfetch

Thanks for your interest in contributing.

This project is designed to be **strict, predictable, and production-grade**. Contributions must follow the guidelines below to be accepted.

---

## 🛠️ Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/Gab-codes/vfetch.git
cd vfetch
npm install
```
````

Run tests:

```bash
npm run test
```

Run coverage:

```bash
npm run coverage
```

---

## 📁 Project Structure

```
src/       → core implementation
tests/     → unit tests
tests/integration/ → integration tests
```

Do **not** mix concerns:

- Unit tests stay in `tests/`
- Full flow / real API tests go in `tests/integration/`

---

## 📏 Rules & Standards

### 1. No breaking changes without discussion

If your change alters behavior, open an issue first.

---

### 2. Tests are mandatory

- Every feature or fix **must include tests**
- No exceptions
- If it’s not tested, it won’t be merged

---

### 3. Keep types strict

- Avoid `any` unless absolutely necessary
- Prefer explicit types
- Maintain full TypeScript safety

---

### 4. Do not modify unrelated code

Only change what your PR is responsible for.

---

### 5. Maintain existing design decisions

This library prioritizes:

- Predictable `{ ok: boolean }` responses
- No throwing for HTTP errors
- Transport-layer responsibility only (no schema validation)

Do not introduce patterns that break this philosophy.

---

### 6. Keep it lightweight

This is a **zero-dependency** library.

Do not add dependencies unless absolutely justified.

---

## 🧪 Testing Guidelines

- Use **Vitest**
- Use mocks for controlled behavior
- Keep tests isolated and deterministic
- Avoid unnecessary real API calls (only in integration tests)

---

## 🚀 Pull Request Process

1. Fork the repo
2. Create a new branch:

   ```bash
   git checkout -b feat/your-feature
   ```

3. Make your changes
4. Add/Update tests
5. Ensure everything passes:

   ```bash
   npm run coverage
   ```

6. Open a PR

---

## ✅ PR Requirements

- All tests must pass
- Coverage must not decrease
- No TypeScript errors
- Clear description of what changed and why

---

## ❌ What Will Be Rejected

- PRs without tests
- Introducing unnecessary dependencies
- Weak typing (`any` abuse)
- Breaking core API design without discussion

---

## 💡 Philosophy

vfetch is built to be:

- Predictable
- Lightweight
- Safe under concurrency

Keep that in mind when contributing.

---

## Thanks for contributing.
