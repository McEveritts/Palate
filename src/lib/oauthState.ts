import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { timingSafeEqualStrings } from "./cronAuth";

export const OAUTH_STATE_COOKIE_NAME = "palate_gcal_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes

export interface OAuthStatePayload {
  state: string; // minimum 32-char hex
  codeVerifier: string; // PKCE verifier
  userId: string; // Palate user ID
  issuedAt: number; // Unix epoch ms
  expiresAt: number; // Unix epoch ms
  nonce?: string; // Optional nonce
}

/**
 * Derives a domain-separated 32-byte key specifically for OAuth state cookies.
 * In production, PALATE_ENCRYPTION_SECRET is strictly required.
 */
export function getOAuthStateKey(secretOverride?: string): Buffer {
  const secret = secretOverride || process.env.PALATE_ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for OAuth state."
      );
    }
    const devFallback = process.env.NEXTAUTH_SECRET;
    if (!devFallback) {
      throw new Error("Missing secret for OAuth state encryption.");
    }
    return crypto.createHmac("sha256", devFallback).update("palate:oauth-state:v1").digest();
  }
  return crypto.createHmac("sha256", secret).update("palate:oauth-state:v1").digest();
}

/**
 * Encrypts an OAuthStatePayload into a secure tamper-proof cookie string.
 * Envelope: enc:state:v1:<ivHex>:<tagHex>:<cipherHex>
 */
export function encryptOAuthState(payload: OAuthStatePayload, secretOverride?: string): string {
  const key = getOAuthStateKey(secretOverride);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const serialized = JSON.stringify(payload);
  let encrypted = cipher.update(serialized, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `enc:state:v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts and runtime-validates an OAuth state cookie string.
 * Strictly rejects plaintext, malformed envelopes, tampered tags, and wrong keys.
 * Returns null if decryption or schema validation fails.
 */
export function decryptOAuthState(
  rawCookie: string | undefined | null,
  secretOverride?: string
): OAuthStatePayload | null {
  if (!rawCookie || typeof rawCookie !== "string") {
    return null;
  }

  // Strictly require authenticated envelope
  if (!rawCookie.startsWith("enc:state:v1:")) {
    return null;
  }

  const parts = rawCookie.split(":");
  if (parts.length !== 6) {
    return null;
  }

  const [, , , ivHex, tagHex, cipherHex] = parts;
  if (!ivHex || !tagHex || !cipherHex || ivHex.length !== 24 || tagHex.length !== 32) {
    return null;
  }

  try {
    const key = getOAuthStateKey(secretOverride);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const parsed = JSON.parse(decrypted);

    // Runtime schema validation
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.state !== "string" ||
      parsed.state.length < 32 ||
      typeof parsed.codeVerifier !== "string" ||
      parsed.codeVerifier.length < 32 ||
      typeof parsed.userId !== "string" ||
      parsed.userId.trim() === "" ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= parsed.issuedAt
    ) {
      return null;
    }

    return parsed as OAuthStatePayload;
  } catch {
    return null;
  }
}

export type StateValidationResult =
  | { success: true; payload: OAuthStatePayload }
  | { success: false; reason: "missing" | "malformed" | "expired" | "user_mismatch" | "state_mismatch" };

/**
 * Validates a returned state parameter against the encrypted state cookie for the current user.
 */
export function validateReturnedOAuthState(
  rawCookie: string | undefined | null,
  returnedState: string | undefined | null,
  currentUserId: string
): StateValidationResult {
  if (!rawCookie) {
    return { success: false, reason: "missing" };
  }

  const payload = decryptOAuthState(rawCookie);
  if (!payload) {
    return { success: false, reason: "malformed" };
  }

  const now = Date.now();
  if (
    now > payload.expiresAt ||
    now < payload.issuedAt - 60000 ||
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > 10 * 60 * 1000
  ) {
    return { success: false, reason: "expired" };
  }

  if (payload.userId !== currentUserId) {
    return { success: false, reason: "user_mismatch" };
  }

  if (!returnedState || !timingSafeEqualStrings(returnedState, payload.state)) {
    return { success: false, reason: "state_mismatch" };
  }

  return { success: true, payload };
}

/**
 * Sets the encrypted state cookie onto a response.
 */
export function setOAuthStateCookie(res: NextResponse, payload: OAuthStatePayload): void {
  const encrypted = encryptOAuthState(payload);
  res.cookies.set(OAUTH_STATE_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
}

/**
 * Clears the state cookie on terminal outcomes.
 */
export function clearOAuthStateCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
