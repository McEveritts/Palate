import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
export const GEMINI_KEY_DOMAIN = "palate:gemini-api-key:v1";

/**
 * Derives a domain-separated 32-byte key specifically for Gemini / UserConfig encryption using HMAC-SHA256.
 */
export function deriveDomainKey(secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(GEMINI_KEY_DOMAIN).digest();
}

/**
 * Legacy key derivation using raw SHA-256 for backwards compatibility during migration.
 */
export function deriveRawKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Default key derivation: uses domain-separated HMAC-SHA256.
 */
export function deriveKey(secret: string): Buffer {
  return deriveDomainKey(secret);
}

/**
 * Resolves the primary key for new encryption.
 * In production, PALATE_ENCRYPTION_SECRET is strictly required.
 */
export function getPrimaryEncryptionKey(): Buffer {
  const secret = process.env.PALATE_ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: PALATE_ENCRYPTION_SECRET must be set in production environment."
      );
    }
    const devFallback = process.env.NEXTAUTH_SECRET;
    if (!devFallback) {
      throw new Error(
        "FATAL: Secure encryption secret is missing. Set PALATE_ENCRYPTION_SECRET in your environment."
      );
    }
    console.warn(
      "[Encryption] Warning: PALATE_ENCRYPTION_SECRET is not set; falling back to NEXTAUTH_SECRET in non-production."
    );
    return deriveDomainKey(devFallback);
  }
  return deriveDomainKey(secret);
}

export interface EncryptedData {
  encryptedString: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts a string using AES-256-GCM with a random 12-byte IV using the primary domain-separated key.
 * Returns the encrypted string, IV, and GCM authentication tag in hex.
 */
export function encryptKey(text: string): EncryptedData {
  const key = getPrimaryEncryptionKey();
  const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedString: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted string given the hex IV and hex authentication tag.
 * Validates the GCM auth tag to guarantee data integrity before returning the plain-text string.
 *
 * PRODUCTION FAIL-CLOSED:
 * Production strictly requires PALATE_ENCRYPTION_SECRET before decrypting.
 *
 * MIGRATION COMPATIBILITY (when primary secret is present):
 * 1. Primary domain-separated key ('palate:gemini-api-key:v1' via PALATE_ENCRYPTION_SECRET)
 * 2. Intermediate raw-SHA PALATE_ENCRYPTION_SECRET ciphertext
 * 3. Legacy NEXTAUTH_SECRET ciphertext (both domain and raw-SHA)
 */
export function decryptKey(encryptedString: string, ivHex: string, authTagHex: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;

  if (isProd && !primarySecret) {
    throw new Error("FATAL: PALATE_ENCRYPTION_SECRET must be configured in production before decrypting.");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  function tryDecryptWithKey(key: Buffer): string | null {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedString, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return null;
    }
  }

  // 1. Try domain-derived primary key (PALATE_ENCRYPTION_SECRET)
  if (primarySecret) {
    const domainKey = deriveDomainKey(primarySecret);
    const decrypted = tryDecryptWithKey(domainKey);
    if (decrypted !== null) {
      return decrypted;
    }

    // 2. Try intermediate raw-SHA key with PALATE_ENCRYPTION_SECRET
    const rawKey = deriveRawKey(primarySecret);
    const decryptedRaw = tryDecryptWithKey(rawKey);
    if (decryptedRaw !== null) {
      console.warn(
        "[Encryption] Decrypted UserConfig ciphertext using earlier raw-SHA PALATE_ENCRYPTION_SECRET. Re-encryption with domain-derived key required."
      );
      return decryptedRaw;
    }

    // 3. Transitional legacy reads with NEXTAUTH_SECRET permitted ONLY when primary secret is present
    const legacySecret = process.env.NEXTAUTH_SECRET;
    if (legacySecret && legacySecret !== primarySecret) {
      const legacyDomainKey = deriveDomainKey(legacySecret);
      const decLegacyDomain = tryDecryptWithKey(legacyDomainKey);
      if (decLegacyDomain !== null) {
        console.warn(
          "[Encryption] Decrypted ciphertext using legacy NEXTAUTH_SECRET. Migration to PALATE_ENCRYPTION_SECRET required."
        );
        return decLegacyDomain;
      }

      const legacyRawKey = deriveRawKey(legacySecret);
      const decLegacyRaw = tryDecryptWithKey(legacyRawKey);
      if (decLegacyRaw !== null) {
        console.warn(
          "[Encryption] Decrypted ciphertext using legacy NEXTAUTH_SECRET (raw-SHA). Migration to PALATE_ENCRYPTION_SECRET required."
        );
        return decLegacyRaw;
      }
    }
  }

  // 4. Non-production fallback when only NEXTAUTH_SECRET was configured
  if (!isProd && !primarySecret && process.env.NEXTAUTH_SECRET) {
    const devKey = deriveDomainKey(process.env.NEXTAUTH_SECRET);
    const decDev = tryDecryptWithKey(devKey);
    if (decDev !== null) return decDev;

    const devRawKey = deriveRawKey(process.env.NEXTAUTH_SECRET);
    const decDevRaw = tryDecryptWithKey(devRawKey);
    if (decDevRaw !== null) return decDevRaw;
  }

  throw new Error("Failed to decrypt key: ciphertext authentication failed or invalid encryption secret.");
}
