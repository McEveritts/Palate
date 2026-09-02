import { describe, it, expect, beforeEach } from "vitest";
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