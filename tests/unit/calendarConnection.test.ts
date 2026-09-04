import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateGoogleCalendarConnection } from "@/lib/googleCalendar";
import {
  encryptOAuthState,
  decryptOAuthState,
  validateReturnedOAuthState,
  OAuthStatePayload,
} from "@/lib/oauthState";
import { encryptToken } from "@/lib/tokenEncryption";

describe("Google Calendar Connection Usability & State Validation", () => {
  const TEST_SECRET = "unit-test-encryption-secret-32-chars-min!";
  const origSecret = process.env.PALATE_ENCRYPTION_SECRET;

  beforeEach(() => {
    process.env.PALATE_ENCRYPTION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (origSecret !== undefined) {
      process.env.PALATE_ENCRYPTION_SECRET = origSecret;
    } else {
      delete process.env.PALATE_ENCRYPTION_SECRET;
    }
  });

  describe("validateGoogleCalendarConnection", () => {
    const calendarScope = "https://www.googleapis.com/auth/calendar openid email";

    it("accepts valid access and refresh tokens", () => {
      const validAccess = encryptToken("ya29.access-token-123");
      const validRefresh = encryptToken("1//04refresh-token-456");

      const status = validateGoogleCalendarConnection({
        scope: calendarScope,
        access_token: validAccess,
        refresh_token: validRefresh,
      });

      expect(status.connected).toBe(true);
      expect(status.hasCalendarScope).toBe(true);
      expect(status.hasUsableCredentials).toBe(true);
    });

    it("accepts missing access token with valid refresh token", () => {
      const validRefresh = encryptToken("1//04refresh-token-456");

      const status = validateGoogleCalendarConnection({
        scope: calendarScope,
        access_token: null,
        refresh_token: validRefresh,
      });

      expect(status.connected).toBe(true);
      expect(status.hasCalendarScope).toBe(true);
      expect(status.hasUsableCredentials).toBe(true);
    });

    it("accepts corrupt access token with valid refresh token", () => {
      const corruptAccess = "enc:v1:corrupt:iv:tag";
      const validRefresh = encryptToken("1//04refresh-token-456");

      const status = validateGoogleCalendarConnection({
        scope: calendarScope,
        access_token: corruptAccess,
        refresh_token: validRefresh,
      });

      expect(status.connected).toBe(true);
      expect(status.hasCalendarScope).toBe(true);
      expect(status.hasUsableCredentials).toBe(true);
    });

    it("rejects when refresh token is missing/corrupt and access token is absent/corrupt", () => {
      const status1 = validateGoogleCalendarConnection({
        scope: calendarScope,
        access_token: null,
        refresh_token: null,
      });
      expect(status1.connected).toBe(false);
      expect(status1.reason).toBe("no_usable_tokens");

      const status2 = validateGoogleCalendarConnection({
        scope: calendarScope,
        access_token: "enc:v1:bad:bad:bad",
        refresh_token: "enc:v1:bad:bad:bad",
      });
      expect(status2.connected).toBe(false);
      expect(status2.reason).toBe("no_usable_tokens");
    });

    it("rejects when Calendar scope is missing even with valid tokens", () => {
      const validAccess = encryptToken("ya29.access-token-123");
      const validRefresh = encryptToken("1//04refresh-token-456");

      const status = validateGoogleCalendarConnection({
        scope: "openid email profile",
        access_token: validAccess,
        refresh_token: validRefresh,
      });

      expect(status.connected).toBe(false);
      expect(status.hasCalendarScope).toBe(false);
      expect(status.reason).toBe("missing_calendar_scope");
    });
  });

  describe("OAuth State TTL & Relative Validation", () => {
    it("rejects state with TTL exceeding 10 minutes (600,000 ms)", () => {
      const now = Date.now();
      const longTtlPayload: OAuthStatePayload = {
        state: "a".repeat(32),
        codeVerifier: "b".repeat(32),
        userId: "user-123",
        issuedAt: now,
        expiresAt: now + 11 * 60 * 1000, // 11 minutes
      };

      const encrypted = encryptOAuthState(longTtlPayload, TEST_SECRET);
      const validation = validateReturnedOAuthState(encrypted, "a".repeat(32), "user-123");
      expect(validation.success).toBe(false);
      expect((validation as any).reason).toBe("expired");
    });

    it("rejects state where expiresAt <= issuedAt", () => {
      const now = Date.now();
      const invalidOrderPayload: OAuthStatePayload = {
        state: "a".repeat(32),
        codeVerifier: "b".repeat(32),
        userId: "user-123",
        issuedAt: now,
        expiresAt: now, // expiresAt == issuedAt
      };

      const encrypted = encryptOAuthState(invalidOrderPayload, TEST_SECRET);
      expect(decryptOAuthState(encrypted, TEST_SECRET)).toBeNull();
    });

    it("accepts valid state within 10-minute window", () => {
      const now = Date.now();
      const validPayload: OAuthStatePayload = {
        state: "a".repeat(32),
        codeVerifier: "b".repeat(32),
        userId: "user-123",
        issuedAt: now,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes
      };

      const encrypted = encryptOAuthState(validPayload, TEST_SECRET);
      const decrypted = decryptOAuthState(encrypted, TEST_SECRET);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.userId).toBe("user-123");

      const validation = validateReturnedOAuthState(encrypted, "a".repeat(32), "user-123");
      expect(validation.success).toBe(true);
    });
  });
});
