import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptOAuthState,
  decryptOAuthState,
  validateReturnedOAuthState,
  OAuthStatePayload,
} from "@/lib/oauthState";
import crypto from "crypto";

describe("OAuth State Authenticated Encryption & Validation", () => {
  const testSecret = "test-oauth-state-secret-at-least-32-chars-long";
  const origPalate = process.env.PALATE_ENCRYPTION_SECRET;
  const origNextAuth = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.PALATE_ENCRYPTION_SECRET = testSecret;
  });

  afterEach(() => {
    if (origPalate !== undefined) process.env.PALATE_ENCRYPTION_SECRET = origPalate;
    else delete process.env.PALATE_ENCRYPTION_SECRET;

    if (origNextAuth !== undefined) process.env.NEXTAUTH_SECRET = origNextAuth;
    else delete process.env.NEXTAUTH_SECRET;
  });

  const validPayload: OAuthStatePayload = {
    state: "0123456789abcdef0123456789abcdef",
    codeVerifier: "abcdefghijklmnopqrstuvwxyz0123456789-_verifier",
    userId: "user-12345",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 600000,
  };

  it("encrypts and roundtrip decrypts a valid payload", () => {
    const encrypted = encryptOAuthState(validPayload);
    expect(encrypted.startsWith("enc:state:v1:")).toBe(true);

    const decrypted = decryptOAuthState(encrypted);
    expect(decrypted).not.toBeNull();
    expect(decrypted!.state).toBe(validPayload.state);
    expect(decrypted!.codeVerifier).toBe(validPayload.codeVerifier);
    expect(decrypted!.userId).toBe(validPayload.userId);
  });

  it("rejects plaintext cookie values", () => {
    const plaintext = JSON.stringify(validPayload);
    expect(decryptOAuthState(plaintext)).toBeNull();
  });

  it("rejects tampered ciphertext and auth tags", () => {
    const encrypted = encryptOAuthState(validPayload);
    const parts = encrypted.split(":");
    // Tamper with ciphertext
    parts[5] = parts[5].slice(0, -2) + "00";
    const tampered = parts.join(":");
    expect(decryptOAuthState(tampered)).toBeNull();

    // Tamper with tag
    parts[4] = "00".repeat(16);
    const tamperedTag = parts.join(":");
    expect(decryptOAuthState(tamperedTag)).toBeNull();
  });

  it("rejects cookies encrypted with a different key", () => {
    const wrongSecret = "wrong-different-secret-key-32-chars-long!";
    const encryptedWithWrongKey = encryptOAuthState(validPayload, wrongSecret);
    expect(decryptOAuthState(encryptedWithWrongKey)).toBeNull();
  });

  it("rejects payloads that fail runtime schema validation", () => {
    // Missing required fields
    const invalidSchema = {
      state: "short",
      codeVerifier: "verifier",
    };
    const key = crypto.createHmac("sha256", testSecret).update("palate:oauth-state:v1").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(JSON.stringify(invalidSchema), "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    const cookie = `enc:state:v1:${iv.toString("hex")}:${tag}:${enc}`;

    expect(decryptOAuthState(cookie)).toBeNull();
  });

  it("validateReturnedOAuthState checks expiry, user match, and state match", () => {
    const encrypted = encryptOAuthState(validPayload);

    // 1. Success
    const valid = validateReturnedOAuthState(encrypted, validPayload.state, validPayload.userId);
    expect(valid.success).toBe(true);

    // 2. State mismatch
    const stateMismatch = validateReturnedOAuthState(
      encrypted,
      "different-state-param-value-0000000000",
      validPayload.userId
    );
    expect(stateMismatch.success).toBe(false);
    if (!stateMismatch.success) {
      expect(stateMismatch.reason).toBe("state_mismatch");
    }

    // 3. User mismatch
    const userMismatch = validateReturnedOAuthState(
      encrypted,
      validPayload.state,
      "different-user-id"
    );
    expect(userMismatch.success).toBe(false);
    if (!userMismatch.success) {
      expect(userMismatch.reason).toBe("user_mismatch");
    }

    // 4. Expired
    const expiredPayload: OAuthStatePayload = {
      ...validPayload,
      issuedAt: Date.now() - 700000,
      expiresAt: Date.now() - 1000,
    };
    const expiredEnc = encryptOAuthState(expiredPayload);
    const expired = validateReturnedOAuthState(expiredEnc, expiredPayload.state, expiredPayload.userId);
    expect(expired.success).toBe(false);
    if (!expired.success) {
      expect(expired.reason).toBe("expired");
    }
  });
});
