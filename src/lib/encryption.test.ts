import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
