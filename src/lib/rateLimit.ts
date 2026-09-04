import crypto from "crypto";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Derives a deterministic HMAC-SHA256 bucket key from client IP and normalized username.
 */
export function computeAuthRateLimitKey(
  ip: string,
  username: string,
  secret: string = process.env.NEXTAUTH_SECRET || "dev-fallback-salt"
): string {
  const normalized = `${ip.trim()}:${username.toLowerCase().trim()}`;
  return crypto.createHmac("sha256", secret).update(normalized).digest("hex");
}

// Alias for backwards compatibility
export const computeRateLimitKey = computeAuthRateLimitKey;

/**
 * Derives a 64-bit signed integer from an HMAC hex string for pg_advisory_xact_lock.
 */
export function deriveAdvisoryLockId(hexKey: string): bigint {
  return BigInt.asIntN(64, BigInt("0x" + hexKey.slice(0, 16)));
}

/**
 * Cleans up expired rate-limit buckets using a concurrency-safe atomic CTE:
 * - Orders by expiresAt ASC
 * - Uses FOR UPDATE SKIP LOCKED to prevent lock contention with active transactions
 * - Re-checks expiresAt in the outer DELETE to prevent deleting concurrently renewed buckets
 */
export async function cleanupExpiredBuckets(
  db: Pick<PrismaClient, "$executeRaw"> = prisma,
  now: Date = new Date(),
  limit: number = 10
): Promise<number> {
  return await db.$executeRaw`
    WITH candidates AS (
      SELECT key FROM "AuthRateLimit"
      WHERE "expiresAt" < ${now}
      ORDER BY "expiresAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "AuthRateLimit" a
    USING candidates c
    WHERE a.key = c.key
      AND a."expiresAt" < ${now}
  `;
}

/**
 * Core concurrency-safe sliding window rate limiter backed by PostgreSQL transaction advisory locks.
 */
export async function checkRateLimit(
  bucketKey: string,
  options: {
    limit?: number;
    windowMs?: number;
    db?: PrismaClient;
    cleanupLimit?: number;
    onCleanupError?: (err: unknown) => void;
  } = {}
): Promise<RateLimitResult> {
  const {
    limit = 5,
    windowMs = 60_000,
    db = prisma,
    cleanupLimit = 10,
  } = options;

  const lockId = deriveAdvisoryLockId(bucketKey);
  const now = new Date();
  let result: RateLimitResult = {
    success: false,
    limit,
    remaining: 0,
    reset: new Date(now.getTime() + windowMs),
  };

  try {
    result = await db.$transaction(async (tx) => {
      // 1. Transaction-level advisory lock (scoped to this tx, released on commit/rollback)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

      const txNow = new Date();
      const windowStart = new Date(txNow.getTime() - windowMs);

      // 2. Lookup existing rate limit bucket
      const bucket = await tx.authRateLimit.findUnique({
        where: { key: bucketKey },
      });

      // 3. Prune timestamps outside the rolling window
      const recentAttempts = bucket
        ? bucket.attempts.filter((t) => t.getTime() > windowStart.getTime())
        : [];

      if (recentAttempts.length >= limit) {
        // Limit reached: update pruned attempts and reset time
        const oldestRecent = recentAttempts[0];
        const expiresAt = new Date(oldestRecent.getTime() + windowMs);
        await tx.authRateLimit.update({
          where: { key: bucketKey },
          data: {
            attempts: recentAttempts,
            expiresAt,
          },
        });
        return {
          success: false,
          limit,
          remaining: 0,
          reset: expiresAt,
        };
      }

      // 4. Accepted attempt: record attempt and update expiration
      const updatedAttempts = [...recentAttempts, txNow];
      const expiresAt = new Date(txNow.getTime() + windowMs);

      await tx.authRateLimit.upsert({
        where: { key: bucketKey },
        create: {
          key: bucketKey,
          attempts: updatedAttempts,
          expiresAt,
        },
        update: {
          attempts: updatedAttempts,
          expiresAt,
        },
      });

      return {
        success: true,
        limit,
        remaining: limit - updatedAttempts.length,
        reset: expiresAt,
      };
    });
  } catch (err: unknown) {
    const errorInfo = err && typeof err === "object" ? (err as { name?: string; code?: string }) : null;
    const sanitizedName = errorInfo?.name || "DatabaseError";
    const sanitizedCode = errorInfo?.code ? `[Code: ${errorInfo.code}]` : "";
    console.error(`[RateLimit] Database error during rate limit check: ${sanitizedName} ${sanitizedCode}`.trim());
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: new Date(now.getTime() + windowMs),
      };
    }
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: new Date(now.getTime() + windowMs),
    };
  }

  // 5. Bounded cleanup executed OUTSIDE transaction with CTE + FOR UPDATE SKIP LOCKED
  if (result.success) {
    try {
      await cleanupExpiredBuckets(db, now, cleanupLimit);
    } catch (cleanupErr: unknown) {
      const errInfo = cleanupErr && typeof cleanupErr === "object" ? (cleanupErr as { name?: string; code?: string }) : null;
      const sanitizedName = errInfo?.name || "CleanupError";
      const sanitizedCode = errInfo?.code ? `[Code: ${errInfo.code}]` : "";
      console.warn(`[RateLimit] Background cleanup error: ${sanitizedName} ${sanitizedCode}`.trim());
      options.onCleanupError?.(cleanupErr);
    }
  }

  return result;
}

/**
 * Checks PostgreSQL-backed sliding window rate limiter for Jellyfin login attempts.
 * Max 5 accepted attempts per rolling 60-second window.
 * Requires PALATE_RATE_LIMIT_SECRET in production for cryptographic key separation.
 */
export async function checkAuthRateLimit(
  ip: string,
  username: string,
  db: PrismaClient = prisma
): Promise<boolean> {
  const rateLimitSecret = process.env.PALATE_RATE_LIMIT_SECRET;
  if (!rateLimitSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[RateLimit] FATAL: Missing PALATE_RATE_LIMIT_SECRET in production. Blocking login.");
      return false;
    }
    const fallbackSecret = process.env.NEXTAUTH_SECRET || "dev-fallback-salt";
    console.warn("[RateLimit] Warning: PALATE_RATE_LIMIT_SECRET not set; falling back to secondary secret in non-production.");
    const bucketKey = computeAuthRateLimitKey(ip, username, fallbackSecret);
    const result = await checkRateLimit(bucketKey, { limit: 5, windowMs: 60_000, db });
    return result.success;
  }

  const bucketKey = computeAuthRateLimitKey(ip, username, rateLimitSecret);
  const result = await checkRateLimit(bucketKey, { limit: 5, windowMs: 60_000, db });
  return result.success;
}