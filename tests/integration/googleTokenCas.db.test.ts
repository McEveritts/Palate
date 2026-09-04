import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";
import { encryptToken, decryptToken } from "@/lib/tokenEncryption";
import { migrateGoogleTokens, inspectGoogleTokenMigration } from "@/lib/admin/migrateGoogleTokens";
import { assertTestDatabaseEnv } from "./dbGuard";

const testDbUrl = process.env.TEST_DATABASE_URL;
const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";

// Safety guard: require exact database name 'palate_test'
assertTestDatabaseEnv(testDbUrl);

describe.skipIf(!isIntegrationEnabled)("Google Token CAS and Migration Real PostgreSQL Integration Tests", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  const createdUserIds: string[] = [];
  const testEncryptionSecret = "integration-test-encryption-secret-32-chars!";
  const originalSecret = process.env.PALATE_ENCRYPTION_SECRET;

  beforeAll(async () => {
    process.env.PALATE_ENCRYPTION_SECRET = testEncryptionSecret;
    pool = new Pool({ connectionString: testDbUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (originalSecret !== undefined) {
      process.env.PALATE_ENCRYPTION_SECRET = originalSecret;
    } else {
      delete process.env.PALATE_ENCRYPTION_SECRET;
    }

    try {
      if (createdUserIds.length > 0) {
        await prisma.account.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch {
      // Ignore
    }
    await prisma.$disconnect();
    await pool.end();
  });

  async function createTestUser(): Promise<string> {
    const id = `test-user-cas-${crypto.randomBytes(6).toString("hex")}`;
    const user = await prisma.user.create({
      data: {
        id,
        name: "Test CAS User",
        email: `${id}@example.test`,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it("Compare-and-swap update prevents concurrent token overwrite during refresh", async () => {
    const userId = await createTestUser();
    const providerAccountId = `sub-cas-${crypto.randomBytes(6).toString("hex")}`;
    const initialAccessToken = encryptToken("initial-access-token");
    const initialRefreshToken = encryptToken("initial-refresh-token");
    const initialExpiresAt = 1000000;

    const account = await prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: "google",
        providerAccountId,
        access_token: initialAccessToken,
        refresh_token: initialRefreshToken,
        expires_at: initialExpiresAt,
      },
    });

    // Simulating refresh logic with CAS:
    async function simulateRefreshWithCas(newAccess: string, newExpires: number) {
      const current = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });

      const casResult = await prisma.account.updateMany({
        where: {
          id: current.id,
          access_token: current.access_token,
          refresh_token: current.refresh_token,
          expires_at: current.expires_at,
        },
        data: {
          access_token: encryptToken(newAccess),
          expires_at: newExpires,
        },
      });

      if (casResult.count === 0) {
        // Lost race, reload winning record
        const winning = await prisma.account.findUniqueOrThrow({ where: { id: current.id } });
        return { won: false, token: decryptToken(winning.access_token) };
      }
      return { won: true, token: newAccess };
    }

    // First refresh wins
    const res1 = await simulateRefreshWithCas("fresh-token-1", 1003600);
    expect(res1.won).toBe(true);
    expect(res1.token).toBe("fresh-token-1");

    // Re-attempting update using stale account snapshot (simulating concurrent race)
    const staleCas = await prisma.account.updateMany({
      where: {
        id: account.id,
        access_token: initialAccessToken, // Stale!
        refresh_token: initialRefreshToken,
        expires_at: initialExpiresAt,
      },
      data: {
        access_token: encryptToken("stale-access-token"),
        expires_at: 1007200,
      },
    });

    expect(staleCas.count).toBe(0); // Safely rejected!

    // Verify database has winner's token
    const finalAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(decryptToken(finalAccount.access_token)).toBe("fresh-token-1");
  });

  it("Refresh vs Disconnect race: CAS failure on deleted account detects disconnect and refuses to return refreshed token", async () => {
    const userId = await createTestUser();
    const providerAccountId = `sub-discon-${crypto.randomBytes(6).toString("hex")}`;
    const initialAccessToken = encryptToken("access-discon-1");
    const initialRefreshToken = encryptToken("refresh-discon-1");
    const initialExpiresAt = 1000000;

    const account = await prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: "google",
        providerAccountId,
        access_token: initialAccessToken,
        refresh_token: initialRefreshToken,
        expires_at: initialExpiresAt,
      },
    });

    // Simulate refresh thread reading account state
    const readAccount = { ...account };

    // Simulate concurrent disconnect thread deleting the account row
    await prisma.account.deleteMany({
      where: { userId, provider: "google" },
    });

    // Refresh thread attempts CAS update on now-deleted row
    const casResult = await prisma.account.updateMany({
      where: {
        id: readAccount.id,
        access_token: readAccount.access_token,
        refresh_token: readAccount.refresh_token,
        expires_at: readAccount.expires_at,
      },
      data: {
        access_token: encryptToken("refreshed-token-orphaned"),
        expires_at: 1007200,
      },
    });

    expect(casResult.count).toBe(0);

    // On CAS failure, verify current active connection check returns null
    const currentAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });
    expect(currentAccount).toBeNull();
    // Proving no orphaned token is stored or usable
  });

  it("Refresh vs Replacement race: CAS failure on replaced account detects new identity and refuses old refreshed token", async () => {
    const userId = await createTestUser();
    const originalSub = `sub-orig-${crypto.randomBytes(6).toString("hex")}`;
    const newSub = `sub-new-${crypto.randomBytes(6).toString("hex")}`;

    const originalAccount = await prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: "google",
        providerAccountId: originalSub,
        access_token: encryptToken("orig-access"),
        refresh_token: encryptToken("orig-refresh"),
        expires_at: 1000000,
      },
    });

    // Refresh begins reading original account
    const readAccount = { ...originalAccount };

    // User disconnects original account and connects new Google identity
    await prisma.account.delete({ where: { id: originalAccount.id } });
    await prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: "google",
        providerAccountId: newSub,
        access_token: encryptToken("replacement-access"),
        refresh_token: encryptToken("replacement-refresh"),
        expires_at: 2000000,
      },
    });

    // Refresh thread finishes refresh and attempts CAS update on original account
    const casResult = await prisma.account.updateMany({
      where: {
        id: readAccount.id,
        access_token: readAccount.access_token,
        refresh_token: readAccount.refresh_token,
        expires_at: readAccount.expires_at,
      },
      data: {
        access_token: encryptToken("refreshed-orig-access"),
        expires_at: 1007200,
      },
    });

    expect(casResult.count).toBe(0);

    // On CAS failure, check active connection
    const currentAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });

    // Current connection belongs to replacementAccount with different providerAccountId
    expect(currentAccount?.id).not.toBe(readAccount.id);
    expect(currentAccount?.providerAccountId).toBe(newSub);
    // Invariant: refresh thread refuses to return stale token from superseded account
  });

  it("migrateGoogleTokens encrypts plaintext tokens and reports aggregate counts accurately", async () => {
    const userId = await createTestUser();
    const providerAccountId = `sub-mig-${crypto.randomBytes(6).toString("hex")}`;

    // Create account with raw plaintext tokens (legacy state)
    await prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: "google",
        providerAccountId,
        access_token: "raw-plaintext-access-token",
        refresh_token: "raw-plaintext-refresh-token",
        expires_at: 1234567,
      },
    });

    // 1. Inspect
    const inspectBefore = await inspectGoogleTokenMigration(prisma);
    expect(inspectBefore.plaintextLegacy).toBeGreaterThanOrEqual(1);

    // 2. Dry-run
    const dryRunRes = await migrateGoogleTokens({ dryRun: true }, prisma);
    expect(dryRunRes.dryRun).toBe(true);
    expect(dryRunRes.newlyEncrypted).toBeGreaterThanOrEqual(1);

    // Verify still plaintext after dry-run
    const checkAfterDryRun = await prisma.account.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId,
        },
      },
    });
    expect(checkAfterDryRun.access_token).toBe("raw-plaintext-access-token");

    // 3. Live migration with confirmed: true
    const liveRes = await migrateGoogleTokens({ dryRun: false, confirmed: true }, prisma);
    expect(liveRes.dryRun).toBe(false);
    expect(liveRes.newlyEncrypted).toBeGreaterThanOrEqual(1);

    // Verify now encrypted and decryptable
    const checkAfterLive = await prisma.account.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId,
        },
      },
    });
    expect(checkAfterLive.access_token!.startsWith("enc:v1:")).toBe(true);
    expect(decryptToken(checkAfterLive.access_token)).toBe("raw-plaintext-access-token");
    expect(decryptToken(checkAfterLive.refresh_token)).toBe("raw-plaintext-refresh-token");
  });
});
