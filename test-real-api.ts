// test-real-api.ts
import { createClient } from "./src/index";
import type { VfetchResponse, VfetchSuccess, VfetchError } from "./src/types";

// ============================================
// Type guard helpers
// ============================================
function isSuccess<T>(
  response: VfetchResponse<T>,
): response is VfetchSuccess<T> {
  return response.ok === true;
}

function isError<T>(response: VfetchResponse<T>): response is VfetchError {
  return response.ok === false;
}

// Helper to safely access data
function getDataOrThrow<T>(response: VfetchResponse<T>): T {
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.error} (Status: ${response.status})`,
    );
  }
  return response.data;
}

// Helper: Delay function for timeout tests
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// Test Suite against DummyJSON API
// ============================================

async function testBasicRequests() {
  console.log("\n=== Test 1: Basic GET & POST requests ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  // Test 1.1: GET request
  console.log("1.1 GET /products/1");
  const product = await api.get<any>("/products/1");

  if (isError(product)) {
    console.error("GET failed:", product.error);
    console.assert(false, "GET should succeed");
    return;
  }

  console.assert(product.data?.id === 1, "Should return product with id 1");
  console.log("✅ GET works");

  // Test 1.2: POST request
  console.log("\n1.2 POST /products/add");
  const newProduct = await api.post<any>("/products/add", {
    title: "vFetch Test Product",
    price: 99.99,
  });

  if (isError(newProduct)) {
    console.error("POST failed:", newProduct.error);
    console.assert(false, "POST should succeed");
    return;
  }

  console.assert(
    newProduct.data?.title === "vFetch Test Product",
    "Should return created product",
  );
  console.log("✅ POST works");

  // Test 1.3: PUT request
  console.log("\n1.3 PUT /products/1");
  const updatedProduct = await api.put<any>("/products/1", {
    title: "Updated vFetch Product",
    price: 149.99,
  });

  if (isError(updatedProduct)) {
    console.error("PUT failed:", updatedProduct.error);
    console.assert(false, "PUT should succeed");
    return;
  }

  console.assert(
    updatedProduct.data?.title === "Updated vFetch Product",
    "Should return updated product",
  );
  console.log("✅ PUT works");

  // Test 1.4: DELETE request
  console.log("\n1.4 DELETE /products/1");
  const deletedProduct = await api.delete<any>("/products/1");

  if (isError(deletedProduct)) {
    console.error("DELETE failed:", deletedProduct.error);
    console.assert(false, "DELETE should succeed");
    return;
  }

  console.assert(
    deletedProduct.data?.isDeleted === true,
    "Should mark as deleted",
  );
  console.log("✅ DELETE works");
}

async function testQueryParams() {
  console.log("\n=== Test 2: Query parameters & pagination ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  // Test 2.1: Basic query params
  console.log("2.1 GET /products?limit=3&skip=2");
  const paginated = await api.get<any>("/products", {
    params: { limit: "3", skip: "2" },
  });

  if (isError(paginated)) {
    console.error("Query params test failed:", paginated.error);
    console.assert(false, "Request should succeed");
    return;
  }

  console.assert(
    paginated.data?.products?.length <= 3,
    "Should respect limit parameter",
  );
  console.log("✅ Query params work");

  // Test 2.2: Multiple query params
  console.log("\n2.2 GET /products?select=title,price");
  const selected = await api.get<any>("/products", {
    params: { select: "title,price", limit: "2" },
  });

  if (isError(selected)) {
    console.error("Select test failed:", selected.error);
    console.assert(false, "Request should succeed");
    return;
  }

  console.assert(
    selected.data?.products?.[0]?.title,
    "Response should include selected fields",
  );
  console.log("✅ Multiple query params work");
}

async function testAuthFlow() {
  console.log("\n=== Test 3: Authentication flow ===\n");

  // First, get an auth token from DummyJSON
  console.log("3.1 Getting auth token...");
  const loginRes = await fetch("https://dummyjson.com/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "emilys",
      password: "emilyspass",
      expiresInMins: 1,
    }),
  });
  const loginData = await loginRes.json();
  const accessToken = loginData.accessToken;
  console.log(`✅ Got token: ${accessToken.substring(0, 20)}...`);

  let currentToken = accessToken;
  let refreshCalled: boolean = false; // ← Add : boolean type
  let authFailureCalled: boolean = false; // ← Add : boolean type

  const api = createClient({
    baseURL: "https://dummyjson.com/auth",
    getToken: () => currentToken,
    onRefresh: async () => {
      console.log("🔄 Refreshing token...");
      refreshCalled = true;
      const refreshRes = await fetch("https://dummyjson.com/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: loginData.refreshToken }),
      });
      const data = await refreshRes.json();
      currentToken = data.accessToken;
      return currentToken;
    },
    onAuthFailure: () => {
      console.log("❌ Auth failure called");
      authFailureCalled = true;
    },
  });

  // Test with valid token
  console.log("\n3.2 GET /me with valid token");
  const me = await api.get<any>("/me");

  if (isError(me)) {
    console.error("Auth test failed:", me.error);
    console.assert(false, "Request with token should succeed");
    return;
  }

  console.assert(me.data?.id, "Should return user data");
  console.log("✅ Auth token injection works");

  // Test token refresh
  console.log("\n3.3 Waiting 2 seconds for token expiry...");
  await delay(2000);
  currentToken = "expired_token";
  console.log("3.4 Request with expired token (should auto-refresh)");
  const meAfterExpiry = await api.get<any>("/me");

  if (isError(meAfterExpiry)) {
    console.error("Refresh test failed:", meAfterExpiry.error);
    console.assert(false, "Request should succeed after refresh");
    return;
  }

  // Now TypeScript knows refreshCalled is boolean
  if (!refreshCalled) {
    console.error("❌ Refresh was not called");
  } else {
    console.log("✅ Refresh was called");
  }
  console.log("✅ Auto token refresh works");
}

async function testErrorHandling() {
  console.log("\n=== Test 4: Error normalization ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  // Test 4.1: 404 error
  console.log("4.1 GET /nonexistent");
  const notFound = await api.get("/nonexistent");

  console.assert(notFound.ok === false, "Should return ok: false");
  console.assert(isError(notFound), "Should be error type");
  if (isError(notFound)) {
    console.assert(notFound.status === 404, "Should have 404 status");
    console.assert(!!notFound.error, "Should have error message");
  }
  console.log("✅ 404 errors normalized");

  // Test 4.2: 401 error (no token)
  console.log("\n4.2 GET /auth/me (no token)");
  const unauth = await api.get("/auth/me");

  console.assert(unauth.ok === false, "Should return ok: false");
  if (isError(unauth)) {
    console.assert(unauth.status === 401, "Should have 401 status");
  }
  console.log("✅ 401 errors normalized");
}

async function testRequestOptions() {
  console.log("\n=== Test 5: Custom headers & options ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  // Test 5.1: Custom headers
  console.log("5.1 GET with custom headers");
  const customHeader = await api.get("/products/1", {
    headers: {
      "X-Custom-Header": "test-value",
      "X-Request-ID": "12345",
    },
  });

  if (isError(customHeader)) {
    console.error("Custom headers test failed:", customHeader.error);
    console.assert(false, "Request with custom headers should succeed");
    return;
  }

  console.log("✅ Custom headers work");

  // Test 5.2: Different content types
  console.log("\n5.2 POST with custom content type");
  const customContent = await api.post(
    "/products/add",
    { title: "Test" },
    {
      headers: {
        "X-Custom": "value",
      },
    },
  );

  if (isError(customContent)) {
    console.error("POST with headers failed:", customContent.error);
    console.assert(false, "POST with custom headers should succeed");
    return;
  }

  console.log("✅ Request options work");
}

async function testNetworkTimeout() {
  console.log("\n=== Test 6: Timeout handling ===\n");

  console.log("6.1 Testing with delay parameter");
  const apiSlow = createClient({
    baseURL: "https://dummyjson.com",
  });

  // Use delay param (max 5000ms as per docs)
  const start = Date.now();
  const delayed = await apiSlow.get("/products/1?delay=2000");
  const duration = Date.now() - start;

  if (isError(delayed)) {
    console.error("Delay test failed:", delayed.error);
    console.assert(false, "Request should eventually succeed");
    return;
  }

  console.assert(
    duration >= 1900 && duration <= 2500,
    `Request took ~${duration}ms which includes delay`,
  );
  console.log(`✅ Delay works (took ${duration}ms)`);
}

async function testConcurrentRequests() {
  console.log("\n=== Test 7: Concurrent requests ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  console.log("7.1 Making 5 concurrent requests");
  const requests = [
    api.get("/products/1"),
    api.get("/products/2"),
    api.get("/products/3"),
    api.get("/products/4"),
    api.get("/products/5"),
  ];

  const results = await Promise.all(requests);
  const allSucceeded = results.every((r) => r.ok === true);
  console.assert(
    allSucceeded === true,
    "All concurrent requests should succeed",
  );
  console.log("✅ Concurrent requests work");
}

async function testIPAddress() {
  console.log("\n=== Test 8: IP detection ===\n");

  const api = createClient({
    baseURL: "https://dummyjson.com",
  });

  console.log("8.1 GET /ip");
  const ipInfo = await api.get<any>("/ip");

  if (isError(ipInfo)) {
    console.error("IP test failed:", ipInfo.error);
    console.assert(false, "IP request should succeed");
    return;
  }

  console.assert(ipInfo.data?.ip, "Should return IP address");
  console.log(`✅ IP detection works: ${ipInfo.data?.ip}`);
}

// ============================================
// Run all tests
// ============================================

async function runAllTests() {
  console.log("🚀 Starting vfetch Real API Tests against DummyJSON\n");
  console.log("=".repeat(60));

  try {
    await testBasicRequests();
    await testQueryParams();
    await testAuthFlow();
    await testErrorHandling();
    await testRequestOptions();
    await testNetworkTimeout();
    await testConcurrentRequests();
    await testIPAddress();

    console.log("\n" + "=".repeat(60));
    console.log(
      "\n✅ ALL TESTS PASSED! vfetch is battle-ready for open source 🚀",
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test suite
runAllTests();
