import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkApiRateLimit,
  apiRateLimitMap,
  API_RATE_LIMIT,
  MAX_MAP_ENTRIES,
} from "./middleware";

describe("Edge Middleware In-Memory Rate Limiter", () => {
  beforeEach(() => {
    apiRateLimitMap.clear();
  });

  it("allows up to 20 attempts in a rolling minute and returns success: false on the 21st attempt", () => {
    const ip = "192.168.1.50";

    // 1st through 20th requests should be allowed
    for (let i = 1; i <= API_RATE_LIMIT; i++) {
      const res = checkApiRateLimit(ip);
      expect(res.success).toBe(true);
      expect(res.limit).toBe(20);
      expect(res.remaining).toBe(API_RATE_LIMIT - i);
    }

    // 21st request must be rejected
    const blockedRes = checkApiRateLimit(ip);
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.limit).toBe(20);
    expect(blockedRes.reset).toBeGreaterThan(0);
  });

  it("strictly bounds map size and evicts the oldest entry in O(1) when exceeding 2,000 entries", () => {
    // Fill map up to MAX_MAP_ENTRIES (2000)
    for (let i = 0; i < MAX_MAP_ENTRIES; i++) {
      checkApiRateLimit(`client_ip_${i}`);
    }

    expect(apiRateLimitMap.size).toBe(MAX_MAP_ENTRIES);
    expect(apiRateLimitMap.has("client_ip_0")).toBe(true);

    // Insert 2,001st entry
    checkApiRateLimit("client_ip_2000");

    // Size remains strictly capped at 2000
    expect(apiRateLimitMap.size).toBe(MAX_MAP_ENTRIES);
    // Oldest entry (client_ip_0) has been evicted
    expect(apiRateLimitMap.has("client_ip_0")).toBe(false);
    // Newest entry is present
    expect(apiRateLimitMap.has("client_ip_2000")).toBe(true);
  });
});

import { NextRequest } from "next/server";
import { handleMiddleware } from "./middleware";

describe("Middleware CSRF and Cron Authorization", () => {
  const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "production-cron-secret-32b-secure";
    apiRateLimitMap.clear();
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET !== undefined) {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  function createReq(url: string, options: { method?: string; headers?: Record<string, string>; token?: any } = {}) {
    const { method = "GET", headers = {}, token = null } = options;
    const req = new NextRequest(url, {
      method,
      headers: new Headers(headers),
    }) as any;
    if (token) {
      req.nextauth = { token };
    }
    return req;
  }

  it("allows valid bearer token without Origin on /api/curate", async () => {
    const req = createReq("http://localhost:28014/api/curate", {
      method: "POST",
      headers: {
        authorization: "Bearer production-cron-secret-32b-secure",
      },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects missing bearer token without Origin on /api/curate with 401", async () => {
    const req = createReq("http://localhost:28014/api/curate", {
      method: "POST",
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invalid bearer token on /api/curate with 401", async () => {
    const req = createReq("http://localhost:28014/api/curate", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret-token",
      },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects malformed bearer token (missing Bearer prefix) on /api/curate with 401", async () => {
    const req = createReq("http://localhost:28014/api/curate", {
      method: "POST",
      headers: {
        authorization: "production-cron-secret-32b-secure",
      },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("allows browser mutation with a valid same-origin Origin header", async () => {
    const req = createReq("http://localhost:28014/api/settings", {
      method: "POST",
      headers: {
        host: "localhost:28014",
        origin: "http://localhost:28014",
      },
      token: { sub: "user-123" },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects browser mutation with a foreign Origin header with 403", async () => {
    const req = createReq("http://localhost:28014/api/settings", {
      method: "POST",
      headers: {
        host: "localhost:28014",
        origin: "https://evil-attacker.com",
      },
      token: { sub: "user-123" },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CSRF Blocked: Invalid Origin.");
  });

  it("rejects browser mutation with no Origin header with 403", async () => {
    const req = createReq("http://localhost:28014/api/settings", {
      method: "POST",
      headers: {
        host: "localhost:28014",
      },
      token: { sub: "user-123" },
    });

    const res = await handleMiddleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CSRF Blocked: Missing Origin header.");
  });
});