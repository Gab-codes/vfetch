// test-auth.ts
import { createClient } from "./src/index";

// Mock fetch globally
const originalFetch = global.fetch;

function setupMockFetch() {
  let validTokens = new Set<string>(["initial-token"]); // Track valid tokens
  let refreshCount = 0;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Properly extract Authorization header
    let authHeader = "";
    if (init?.headers instanceof Headers) {
      authHeader = init.headers.get("Authorization") || "";
    } else if (init?.headers && typeof init.headers === "object") {
      authHeader =
        (init.headers as Record<string, string>)["Authorization"] || "";
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "");

    console.log(`📡 Request to: ${url}`);
    console.log(`🔑 Auth header: ${authHeader || "none"}`);

    // Mock refresh endpoint
    if (url.includes("/auth/refresh")) {
      refreshCount++;
      console.log(`🔄 Refresh called (${refreshCount} times)`);

      if (refreshCount === 1) {
        // First refresh succeeds - issue a valid token
        const newToken = "new-token";
        validTokens.add(newToken);
        return Response.json({ token: newToken });
      } else {
        // Second refresh fails
        return Response.json(
          { error: "Invalid refresh token" },
          { status: 401 },
        );
      }
    }

    // Mock protected endpoint
    if (url.includes("/protected")) {
      // Validate token properly - check if it's in validTokens set
      if (!token || !validTokens.has(token)) {
        console.log(`❌ Invalid/expired token: ${token}`);
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      console.log(`✅ Valid token: ${token}`);
      return Response.json(
        { data: "Success!", tokenUsed: token },
        { status: 200 },
      );
    }

    // Default response
    return Response.json({ message: "Default response" }, { status: 200 });
  };
}

async function testSuccessfulRefresh() {
  console.log("\n=== Test 1: Successful token refresh ===\n");

  let currentToken = "expired-token";
  let refreshCalled = false;
  let authFailureCalled = false;

  const api = createClient({
    baseURL: "http://test.com",
    getToken: () => currentToken,
    onRefresh: async () => {
      console.log("🔄 Refreshing token...");
      refreshCalled = true;
      const response = await fetch("http://test.com/auth/refresh");
      const data = await response.json();
      currentToken = data.token;
      return currentToken;
    },
    onAuthFailure: () => {
      console.log("❌ Auth failure called");
      authFailureCalled = true;
    },
  });

  // First request with expired token
  const result = await api.get("/protected");
  console.log("Result:", result);
  console.log(`Token after request: ${currentToken}`);
  console.log(`Refresh called: ${refreshCalled}`);
  console.log(`Auth failure called: ${authFailureCalled}`);

  // Verify results
  console.assert((refreshCalled = true), "✅ Refresh was called");
  console.assert(currentToken === "new-token", "✅ Token was updated");
  console.assert(result.ok === true, "✅ Request succeeded after refresh");
}

async function testFailedRefresh() {
  console.log(
    "\n=== Test 2: Failed refresh (should trigger auth failure) ===\n",
  );

  let currentToken = "expired-token";
  let authFailureCalled = false;
  let testRefreshCount = 0;

  const api = createClient({
    baseURL: "http://test.com",
    getToken: () => currentToken,
    onRefresh: async () => {
      testRefreshCount++;
      console.log(`🔄 Refresh attempt ${testRefreshCount}...`);
      const response = await fetch("http://test.com/auth/refresh");

      if (!response.ok) {
        throw new Error("Refresh failed");
      }

      const data = await response.json();
      currentToken = data.token;
      return currentToken;
    },
    onAuthFailure: () => {
      console.log("❌ Auth failure callback triggered!");
      authFailureCalled = true;
    },
  });

  try {
    const result = await api.get("/protected");
    console.log("Result:", result);
  } catch (error) {
    console.log("Caught error:", error);
  }

  console.log(`Auth failure called: ${authFailureCalled}`);
  console.assert((authFailureCalled = true), "✅ Auth failure was triggered");
}

async function testInfiniteRefreshProtection() {
  console.log("\n=== Test 3: Infinite refresh protection ===\n");

  let currentToken = "expired-token";
  let refreshCount = 0;
  let authFailureCalled = false;

  const api = createClient({
    baseURL: "http://test.com",
    getToken: () => currentToken,
    onRefresh: async () => {
      refreshCount++;
      console.log(`🔄 Refresh attempt ${refreshCount}...`);
      currentToken = "still-invalid-token";
      return currentToken;
    },
    onAuthFailure: () => {
      console.log("❌ Auth failure called - prevented infinite loop!");
      authFailureCalled = true;
    },
  });

  const result = await api.get("/protected");
  console.log("Result:", result);
  console.log(`Refresh attempts: ${refreshCount}`);
  console.log(`Auth failure called: ${authFailureCalled}`);

  // The request should fail because the new token is still invalid
  console.assert(result.ok === false, "✅ Request failed (expected)");
  console.assert(result.status === 401, "✅ Got 401 status");
  console.assert(
    refreshCount === 1,
    "✅ Only one refresh attempt (protection worked)",
  );
  console.assert((authFailureCalled = true), "✅ Auth failure triggered");
}

// Run tests
async function runTests() {
  setupMockFetch();

  await testSuccessfulRefresh();
  await testFailedRefresh();
  await testInfiniteRefreshProtection();

  // Restore original fetch
  global.fetch = originalFetch;
  console.log("\n✅ All tests complete!");
}

runTests().catch(console.error);
