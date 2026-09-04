import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptKey, decryptKey } from './encryption';

describe('encryption utility', () => {
  const TEST_SECRET = 'test_encryption_secret_for_unit_tests_32b';

  beforeEach(() => {
    process.env.PALATE_ENCRYPTION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.PALATE_ENCRYPTION_SECRET;
  });

  it('should throw if no encryption secret is configured', () => {
    delete process.env.PALATE_ENCRYPTION_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => encryptKey('test')).toThrow('FATAL: Secure encryption secret is missing');
  });
  it('should encrypt and decrypt strings correctly', () => {
    const plainText = "AIzaSyTestApiKey12345";
    const encrypted = encryptKey(plainText);
    
    expect(encrypted.encryptedString).not.toBe(plainText);
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes in hex
    
    const decrypted = decryptKey(encrypted.encryptedString, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(plainText);
  });

  it('should throw an error if the authenticated GCM tag is tampered with', () => {
    const plainText = "another_secret";
    const encrypted = encryptKey(plainText);
    
    // Tamper with the tag
    const tamperedTag = encrypted.authTag.substring(0, 31) + (encrypted.authTag[31] === '0' ? '1' : '0');
    
    expect(() => {
      decryptKey(encrypted.encryptedString, encrypted.iv, tamperedTag);
    }).toThrow();
  });

  it('should encrypt and decrypt an empty string', () => {
    const plainText = "";
    const encrypted = encryptKey(plainText);
    const decrypted = decryptKey(encrypted.encryptedString, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(plainText);
  });

  it('should encrypt and decrypt a very long string', () => {
    const plainText = "A".repeat(10000);
    const encrypted = encryptKey(plainText);
    const decrypted = decryptKey(encrypted.encryptedString, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(plainText);
  });

  it('should encrypt and decrypt strings with unicode characters', () => {
    const plainText = "こんにちは世界 🚀";
    const encrypted = encryptKey(plainText);
    const decrypted = decryptKey(encrypted.encryptedString, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(plainText);
  });

  it('should fallback to NEXTAUTH_SECRET if PALATE_ENCRYPTION_SECRET is not set', () => {
    delete process.env.PALATE_ENCRYPTION_SECRET;
    process.env.NEXTAUTH_SECRET = 'fallback_secret_for_tests';
    const plainText = "test_string";
    const encrypted = encryptKey(plainText);
    const decrypted = decryptKey(encrypted.encryptedString, encrypted.iv, encrypted.authTag);
    expect(decrypted).toBe(plainText);
    delete process.env.NEXTAUTH_SECRET;
  });

  it('should throw an error if the encrypted string is tampered with', () => {
    const plainText = "secret_message";
    const encrypted = encryptKey(plainText);

    // Tamper with the encrypted string
    const tamperedString = encrypted.encryptedString.substring(0, encrypted.encryptedString.length - 1) +
      (encrypted.encryptedString[encrypted.encryptedString.length - 1] === '0' ? '1' : '0');

    expect(() => {
      decryptKey(tamperedString, encrypted.iv, encrypted.authTag);
    }).toThrow();
  });

  it('should throw an error if the IV is tampered with', () => {
    const plainText = "secret_message";
    const encrypted = encryptKey(plainText);

    // Tamper with the IV
    const tamperedIv = encrypted.iv.substring(0, 23) + (encrypted.iv[23] === '0' ? '1' : '0');

    expect(() => {
      decryptKey(encrypted.encryptedString, tamperedIv, encrypted.authTag);
    }).toThrow();
  });

  it('should produce different encrypted strings for the same input (non-deterministic)', () => {
    const plainText = "same_message";
    const encrypted1 = encryptKey(plainText);
    const encrypted2 = encryptKey(plainText);

    expect(encrypted1.encryptedString).not.toBe(encrypted2.encryptedString);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('strictly requires PALATE_ENCRYPTION_SECRET in production and refuses fallback', () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.PALATE_ENCRYPTION_SECRET;
      process.env.NEXTAUTH_SECRET = "fallback_secret_for_tests";

      expect(() => encryptKey("test_key")).toThrow(
        "FATAL: PALATE_ENCRYPTION_SECRET must be set in production environment"
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('supports bounded legacy fallback: decrypts ciphertext encrypted with NEXTAUTH_SECRET when PALATE_ENCRYPTION_SECRET is active', () => {
    // 1. Encrypt with legacy NEXTAUTH_SECRET
    delete process.env.PALATE_ENCRYPTION_SECRET;
    process.env.NEXTAUTH_SECRET = "legacy-secret-32-chars-minimum!";
    const secretPlaintext = "my-secret-gemini-api-key";
    const legacyEncrypted = encryptKey(secretPlaintext);

    // 2. Switch to new distinct PALATE_ENCRYPTION_SECRET
    process.env.PALATE_ENCRYPTION_SECRET = "new-primary-palate-secret-key-32";
    process.env.NEXTAUTH_SECRET = "legacy-secret-32-chars-minimum!";

    // 3. decryptKey should transparently succeed via the bounded legacy fallback
    const decrypted = decryptKey(
      legacyEncrypted.encryptedString,
      legacyEncrypted.iv,
      legacyEncrypted.authTag
    );

    expect(decrypted).toBe(secretPlaintext);
  });

  it('fails closed in production: decryptKey throws if PALATE_ENCRYPTION_SECRET is absent even if NEXTAUTH_SECRET is set', () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.PALATE_ENCRYPTION_SECRET;
      process.env.NEXTAUTH_SECRET = "legacy-secret-32-chars-minimum!";

      expect(() => decryptKey("somehex", "0".repeat(24), "0".repeat(32))).toThrow(
        /FATAL: PALATE_ENCRYPTION_SECRET must be configured in production before decrypting/
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('decrypts ciphertext originally encrypted with intermediate raw-SHA PALATE_ENCRYPTION_SECRET', async () => {
    const crypto = await import("crypto");
    const secret = "intermediate-raw-sha-secret-32ch!";
    process.env.PALATE_ENCRYPTION_SECRET = secret;

    // Encrypt manually using raw-SHA key
    const rawKey = crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", rawKey, iv);
    const text = "api-key-encrypted-with-raw-sha";
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    // Decrypt using decryptKey with primary secret active
    const decrypted = decryptKey(encrypted, iv.toString("hex"), tag);
    expect(decrypted).toBe(text);
  });
});
