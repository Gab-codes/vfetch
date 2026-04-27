// test-auth.ts
import { createClient } from "./src/index";

// Mock fetch globally
const originalFetch = global.fetch;

function setupMockFetch() {
  let token = "initial-token";
  let refreshCount = 0;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Properly extract Authorization header from Headers object
    let authHeader = "";
    if (init?.headers instanceof Headers) {
      authHeader = init.headers.get("Authorization") || "";
    } else if (init?.headers && typeof init.headers === "object") {
      authHeader =
        (init.headers as Record<string, string>)["Authorization"] || "";
    }

    console.log(`📡 Request to: ${url}`);
    console.log(`🔑 Auth header: ${authHeader || "none"}`);

    // Mock refresh endpoint
    if (url.includes("/auth/refresh")) {
      refreshCount++;
      console.log(`🔄 Refresh called (${refreshCount} times)`);

      if (refreshCount === 1) {
        // First refresh succeeds
        token = "new-token";
        return Response.json({ token: "new-token" });
      } else {
        // Second refresh fails - should trigger onAuthFailure
        return Response.json(
          { error: "Invalid refresh token" },
          { status: 401 },
        );
      }
    }

    // Mock protected endpoint
    if (url.includes("/protected")) {
      // Use authHeader variable instead of headers.Authorization
      if (!authHeader || authHeader === "Bearer expired-token") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (authHeader === `Bearer ${token}`) {
        return Response.json(
          { data: "Success!", tokenUsed: token },
          { status: 200 },
        );
      }
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

  // Reset refresh count for this test
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

// Run tests
async function runTests() {
  setupMockFetch();

  await testSuccessfulRefresh();
  await testFailedRefresh();

  // Restore original fetch
  global.fetch = originalFetch;
  console.log("\n✅ All tests complete!");
}

runTests().catch(console.error);
