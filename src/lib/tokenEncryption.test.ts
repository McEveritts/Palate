import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encryptToken, decryptToken, isTokenEncrypted } from "./tokenEncryption";

describe("OAuth Token Encryption at Rest", () => {
  const PRIMARY_SECRET = "primary-test-secret-32-chars-min!";
  const LEGACY_SECRET = "legacy-fallback-secret-32-min-pad";
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PALATE_ENCRYPTION_SECRET: PRIMARY_SECRET,
      NEXTAUTH_SECRET: LEGACY_SECRET,
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
  });

  it("encrypts plaintext token and returns enc:v1: prefixed envelope", () => {
    const rawToken = "ya29.a0AfH6SMTestGoogleAccessToken123456789";
    const encrypted = encryptToken(rawToken);

    expect(encrypted).not.toBe(rawToken);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(isTokenEncrypted(encrypted)).toBe(true);
  });

  it("decrypts encrypted token back to original plaintext", () => {
    const rawToken = "1//04TestGoogleRefreshToken-xyz987654321";
    const encrypted = encryptToken(rawToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(rawToken);
  });

  it("is idempotent: does not double-encrypt an already encrypted token", () => {
    const rawToken = "ya29.sample-token-abc";
    const encryptedOnce = encryptToken(rawToken);
    const encryptedTwice = encryptToken(encryptedOnce);

    expect(encryptedTwice).toBe(encryptedOnce);
  });

  it("transparently returns legacy plaintext tokens with a warning", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const legacyPlaintext = "ya29.unmigrated-plaintext-token";

    expect(isTokenEncrypted(legacyPlaintext)).toBe(false);
    const result = decryptToken(legacyPlaintext);

    expect(result).toBe(legacyPlaintext);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Read unmigrated plaintext token")
    );
    consoleWarnSpy.mockRestore();
  });

  it("fails decryption if the ciphertext or authentication tag is tampered with", () => {
    const rawToken = "my-secret-token";
    const encrypted = encryptToken(rawToken);
    const parts = encrypted.split(":");
    // Tamper with auth tag
    parts[3] = parts[3].slice(0, -1) + (parts[3].slice(-1) === "0" ? "1" : "0");
    const tampered = parts.join(":");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("strictly requires PALATE_ENCRYPTION_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PALATE_ENCRYPTION_SECRET;

    expect(() => encryptToken("some-token")).toThrow(
      "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production"
    );
  });

  it("strictly requires PALATE_ENCRYPTION_SECRET in production for decryption (fails closed even for plaintext)", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PALATE_ENCRYPTION_SECRET;

    expect(() => decryptToken("ya29.plaintext-token")).toThrow(
      "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for token decryption."
    );
    expect(() => decryptToken("enc:v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:deadbeef")).toThrow(
      "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for token decryption."
    );
  });

  it("fails decryption if encrypted with a different secret (no NEXTAUTH_SECRET fallback for OAuth envelopes)", () => {
    // Encrypt with legacy secret
    delete process.env.PALATE_ENCRYPTION_SECRET;
    process.env.NEXTAUTH_SECRET = LEGACY_SECRET;
    const token = "ya29.legacy-token-data";
    const encryptedWithLegacy = encryptToken(token);

    // Switch to new primary secret
    process.env.PALATE_ENCRYPTION_SECRET = PRIMARY_SECRET;
    process.env.NEXTAUTH_SECRET = LEGACY_SECRET;

    expect(() => decryptToken(encryptedWithLegacy)).toThrow("Failed to decrypt stored token.");
  });
});
