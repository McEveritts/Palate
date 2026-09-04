import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
export const TOKEN_ENCRYPTION_PREFIX = "enc:v1:";

export type TokenClassification =
  | "primaryKeyEncrypted"
  | "plaintextLegacy"
  | "malformed"
  | "unreadable";

/**
 * Derives a domain-separated 32-byte key specifically for Google OAuth tokens using HMAC-SHA256.
 * Fails closed in production if PALATE_ENCRYPTION_SECRET is missing.
 */
export function getGoogleOAuthTokenKey(): Buffer {
  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;
  if (!primarySecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for token encryption."
      );
    }
    const devFallback = process.env.NEXTAUTH_SECRET;
    if (!devFallback) {
      throw new Error(
        "FATAL: Secure encryption secret is missing. Set PALATE_ENCRYPTION_SECRET in your environment."
      );
    }
    console.warn(
      "[TokenEncryption] Warning: PALATE_ENCRYPTION_SECRET is not set; falling back to NEXTAUTH_SECRET in non-production."
    );
    return crypto.createHmac("sha256", devFallback).update("palate:google-oauth-token:v1").digest();
  }
  return crypto.createHmac("sha256", primarySecret).update("palate:google-oauth-token:v1").digest();
}

/**
 * Inspects and classifies a token record using authenticated decryption rather than prefix matching alone.
 */
export function classifyToken(token: string | null | undefined): TokenClassification {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return "plaintextLegacy";
  }

  if (!token.startsWith(TOKEN_ENCRYPTION_PREFIX)) {
    return "plaintextLegacy";
  }

  const parts = token.slice(TOKEN_ENCRYPTION_PREFIX.length).split(":");
  if (parts.length !== 3 || parts[0].length !== 24 || parts[1].length !== 32 || !parts[2]) {
    return "malformed";
  }

  try {
    const key = getGoogleOAuthTokenKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    decipher.update(parts[2], "hex", "utf8");
    decipher.final("utf8");
    return "primaryKeyEncrypted";
  } catch {
    return "unreadable";
  }
}

/**
 * Checks whether a token is successfully encrypted and readable with the primary key.
 */
export function isTokenEncrypted(token: string | null | undefined): boolean {
  return classifyToken(token) === "primaryKeyEncrypted";
}

/**
 * Encrypts an OAuth token (access or refresh token) using AES-256-GCM with a 12-byte random IV.
 * Uses domain-separated key 'palate:google-oauth-token:v1'.
 * Returns an envelope string: enc:v1:<ivHex>:<tagHex>:<cipherHex>
 */
export function encryptToken(token: string): string {
  if (!token) return token;

  // Idempotency: if already validly encrypted with current key, do not re-encrypt
  if (isTokenEncrypted(token)) {
    return token;
  }

  const key = getGoogleOAuthTokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${TOKEN_ENCRYPTION_PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token using the domain-separated primary key.
 * Production runtime token decryption fails closed if PALATE_ENCRYPTION_SECRET is missing.
 * No fallback to NEXTAUTH_SECRET is permitted for enc:v1: tokens.
 * Plaintext legacy tokens are returned directly with a migration warning.
 */
export function decryptToken(storedToken: string | null | undefined): string | null {
  if (!storedToken) return null;

  const isProd = process.env.NODE_ENV === "production";
  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;

  // Production must require PALATE_ENCRYPTION_SECRET before decrypting anything.
  // OAuth plaintext compatibility must not bypass the production primary-secret requirement.
  if (isProd && !primarySecret) {
    throw new Error("FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for token decryption.");
  }

  if (!storedToken.startsWith(TOKEN_ENCRYPTION_PREFIX)) {
    // Legacy plaintext token encountered
    console.warn(
      "[TokenEncryption] Warning: Read unmigrated plaintext token. Migration to encrypted storage required."
    );
    return storedToken;
  }

  const parts = storedToken.slice(TOKEN_ENCRYPTION_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token envelope structure.");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (!ivHex || !authTagHex || !cipherHex || ivHex.length !== 24 || authTagHex.length !== 32) {
    throw new Error("Malformed encrypted token envelope components.");
  }

  const key = getGoogleOAuthTokenKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    console.error("[TokenEncryption] Decryption failed: invalid key or tampered ciphertext.");
    throw new Error("Failed to decrypt stored token.");
  }
}
