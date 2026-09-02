import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";
import {
  checkAuthRateLimit,
  checkRateLimit,
  cleanupExpiredBuckets,
  computeAuthRateLimitKey,
} from "@/lib/rateLimit";

const testDbUrl = process.env.TEST_DATABASE_URL;
const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";

// Safety guard: require exact database name 'palate_test' and treat malformed URLs as fatal
if (isIntegrationEnabled) {
  if (!testDbUrl) {
    throw new Error("FATAL: RUN_DB_INTEGRATION is true but TEST_DATABASE_URL is not provided.");
  }
  let dbName: string;
  try {
    const url = new URL(testDbUrl);
    dbName = url.pathname.replace(/^\//, "");
  } catch (err: any) {
    throw new Error(`FATAL: Malformed TEST_DATABASE_URL: ${err.message}`);
  }
  if (dbName !== "palate_test") {
    throw new Error(
      `FATAL: Integration tests must run strictly against database 'palate_test', but received '${dbName}'.`
    );
  }
}

describe.skipIf(!isIntegrationEnabled)("PostgreSQL Rate Limiter Real Database Integration", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  const testKeys: string[] = [];
  const testSecret = "integration-test-secret-key-12345";
  const originalSecret = process.env.NEXTAUTH_SECRET;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = testSecret;
    pool = new Pool({ connectionString: testDbUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (originalSecret !== undefined) {
      process.env.NEXTAUTH_SECRET = originalSecret;
    } else {
      delete process.env.NEXTAUTH_SECRET;
    }

    if (testKeys.length > 0) {
      try {
        await prisma.authRateLimit.deleteMany({
          where: { key: { in: testKeys } },
        });
      } catch {
        // Cleanup test keys
      }
    }
    await prisma.$disconnect();
    await pool.end();
  });

  it("proves ten simultaneous attempts on real PostgreSQL yield exactly five allowed and five blocked", async () => {
    const randomHex = crypto.randomBytes(6).toString("hex");
    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const testUser = `concurrent_pg_user_${randomHex}`;
    const bucketKey = computeAuthRateLimitKey(testIp, testUser, testSecret);
    testKeys.push(bucketKey);

    // Launch 10 simultaneous requests using the exact production checkAuthRateLimit implementation
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => checkAuthRateLimit(testIp, testUser, prisma))
    );

    const allowedCount = results.filter((res) => res === true).length;
    const blockedCount = results.filter((res) => res === false).length;

    expect(allowedCount).toBe(5);
    expect(blockedCount).toBe(5);

    // Directly inspect PostgreSQL database to verify exactly 5 attempt timestamps are committed
    const committedBucket = await prisma.authRateLimit.findUnique({
      where: { key: bucketKey },
    });

    expect(committedBucket).not.toBeNull();
    expect(committedBucket!.attempts.length).toBe(5);
  });

  it("proves cleanup failure path reports error and does not abort the rate limit transaction", async () => {
    const randomHex = crypto.randomBytes(6).toString("hex");
    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const testUser = `cleanup_isolation_user_${randomHex}`;
    const bucketKey = computeAuthRateLimitKey(testIp, testUser, testSecret);
    testKeys.push(bucketKey);

    let cleanupErrorReported: any = null;

    // Create a database client proxy that succeeds on all transaction queries but throws on cleanup
    let inTransaction = false;
    const errorInjectingDb = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "$transaction") {
          return async (fn: any) => {
            inTransaction = true;
            try {
              return await target.$transaction(fn);
            } finally {
              inTransaction = false;
            }
          };
        }
        if (prop === "$executeRaw" && !inTransaction) {
          // Outside transaction: cleanup query throws an error
          return async () => {
            throw new Error("Simulated transient cleanup connection dropped");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = await checkRateLimit(bucketKey, {
      limit: 5,
      windowMs: 60_000,
      db: errorInjectingDb as any,
      cleanupLimit: 10,
      onCleanupError: (err) => {
        cleanupErrorReported = err;
      },
    });

    // 1. Assert rate limit attempt succeeded
    expect(result.success).toBe(true);

    // 2. Assert that onCleanupError was invoked with the cleanup failure
    expect(cleanupErrorReported).not.toBeNull();
    expect(cleanupErrorReported.message).toBe("Simulated transient cleanup connection dropped");

    // 3. Assert the rate limit record was committed in PostgreSQL despite the cleanup failure
    const committedBucket = await prisma.authRateLimit.findUnique({
      where: { key: bucketKey },
    });

    expect(committedBucket).not.toBeNull();
    expect(committedBucket!.attempts.length).toBe(1);
  });

  it("proves cleanup with FOR UPDATE SKIP LOCKED skips rows held in open renewal transactions", async () => {
    const randomHex = crypto.randomBytes(6).toString("hex");
    const testKey = `test_renewal_key_${randomHex}`;
    testKeys.push(testKey);

    const pastDate = new Date(Date.now() - 120_000);
    const renewedDate = new Date(Date.now() + 60_000);

    // 1. Insert an expired bucket
    await prisma.authRateLimit.create({
      data: {
        key: testKey,
        attempts: [pastDate],
        expiresAt: pastDate,
      },
    });

    // 2. Acquire a dedicated client from the pool to hold an uncommitted renewal transaction with a row lock
    let committed = false;
    const renewalClient = await pool.connect();
    try {
      await renewalClient.query("BEGIN");
      // Acquire exclusive row lock on the expired bucket
      const lockRes = await renewalClient.query(
        'SELECT key FROM "AuthRateLimit" WHERE key = $1 FOR UPDATE',
        [testKey]
      );
      expect(lockRes.rowCount).toBe(1);

      // 3. While renewalClient holds the row lock in an uncommitted transaction, run cleanup from another connection
      // SKIP LOCKED must immediately skip the locked row without blocking or deleting it
      const deletedCount = await cleanupExpiredBuckets(prisma, new Date(), 10);

      // 4. In the renewal transaction, update expiresAt and commit
      await renewalClient.query(
        'UPDATE "AuthRateLimit" SET "expiresAt" = $1 WHERE key = $2',
        [renewedDate, testKey]
      );
      await renewalClient.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) {
        try {
          await renewalClient.query("ROLLBACK");
        } catch {
          // Ignore rollback errors during error cleanup
        }
      }
      renewalClient.release();
    }

    // 5. Verify the bucket was NOT deleted by cleanup and has the renewed timestamp
    const bucketAfterCleanup = await prisma.authRateLimit.findUnique({
      where: { key: testKey },
    });

    expect(bucketAfterCleanup).not.toBeNull();
    expect(bucketAfterCleanup!.expiresAt.getTime()).toBe(renewedDate.getTime());
  });
});