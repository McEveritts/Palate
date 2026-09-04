import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";
import { decryptToken } from "@/lib/tokenEncryption";
import { linkGoogleAccount, AccountLinkError } from "@/lib/googleAccountService";
import { assertTestDatabaseEnv } from "./dbGuard";

const testDbUrl = process.env.TEST_DATABASE_URL;
const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";

// Safety guard: require exact database name 'palate_test'
assertTestDatabaseEnv(testDbUrl);

describe.skipIf(!isIntegrationEnabled)("Google Account Ownership Real PostgreSQL Integration Tests", () => {
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
        await prisma.userConfig.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch {
      // Ignore
    }
    await prisma.$disconnect();
    await pool.end();
  });

  async function createTestUser(name: string): Promise<{ id: string }> {
    const id = `test-user-${crypto.randomBytes(6).toString("hex")}`;
    const user = await prisma.user.create({
      data: {
        id,
        name,
        email: `${id}@example.test`,
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id };
  }

  it("Two users simultaneously connecting the same Google subject: exactly one wins and ownership cannot be transferred", async () => {
    const userA = await createTestUser("User A");
    const userB = await createTestUser("User B");
    const sharedGoogleSub = `google-sub-${crypto.randomBytes(8).toString("hex")}`;

    const results = await Promise.allSettled([
      linkGoogleAccount(
        {
          userId: userA.id,
          googleSub: sharedGoogleSub,
          accessToken: "token-user-a",
        },
        prisma
      ),
      linkGoogleAccount(
        {
          userId: userB.id,
          googleSub: sharedGoogleSub,
          accessToken: "token-user-b",
        },
        prisma
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(AccountLinkError);
    expect(error.code).toBe("account_already_linked_to_another_user");

    // Verify row in database strictly belongs to the winning user
    const finalAccount = await prisma.account.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: sharedGoogleSub,
        },
      },
    });

    const winningResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(finalAccount.id).toBe(winningResult.accountId);
  });

  it("Two concurrent callbacks for the same user with different Google subjects: exactly one wins and exactly one row exists", async () => {
    const user = await createTestUser("User Concurrent Subs");
    const sub1 = `google-sub-con-1-${crypto.randomBytes(6).toString("hex")}`;
    const sub2 = `google-sub-con-2-${crypto.randomBytes(6).toString("hex")}`;

    const results = await Promise.allSettled([
      linkGoogleAccount(
        {
          userId: user.id,
          googleSub: sub1,
          accessToken: "token-1",
        },
        prisma
      ),
      linkGoogleAccount(
        {
          userId: user.id,
          googleSub: sub2,
          accessToken: "token-2",
        },
        prisma
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(AccountLinkError);
    expect(
      error.code === "user_already_has_different_account" ||
      error.code === "account_conflict"
    ).toBe(true);

    // Database invariant: strictly 1 Google account row for this user
    const userAccounts = await prisma.account.findMany({
      where: { userId: user.id, provider: "google" },
    });
    expect(userAccounts).toHaveLength(1);
  });

  it("Refuses to silently replace an existing different Google connection; requires explicit disconnect", async () => {
    const user = await createTestUser("User Replacement Guard");
    const sub1 = `google-sub-rg-1-${crypto.randomBytes(6).toString("hex")}`;
    const sub2 = `google-sub-rg-2-${crypto.randomBytes(6).toString("hex")}`;

    // 1. Initial connection succeeds
    const initial = await linkGoogleAccount(
      {
        userId: user.id,
        googleSub: sub1,
        accessToken: "token-initial",
      },
      prisma
    );
    expect(initial.success).toBe(true);

    // 2. Attempting to connect a second different Google account is rejected without silent deletion
    await expect(
      linkGoogleAccount(
        {
          userId: user.id,
          googleSub: sub2,
          accessToken: "token-second",
        },
        prisma
      )
    ).rejects.toThrow(AccountLinkError);

    // Verify sub1 account is intact
    const account = await prisma.account.findUnique({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "google",
        },
      },
    });
    expect(account?.providerAccountId).toBe(sub1);

    // 3. User explicitly disconnects
    await prisma.account.deleteMany({
      where: { userId: user.id, provider: "google" },
    });

    // 4. Now connecting sub2 succeeds cleanly
    const second = await linkGoogleAccount(
      {
        userId: user.id,
        googleSub: sub2,
        accessToken: "token-second",
      },
      prisma
    );
    expect(second.success).toBe(true);
    expect(second.action).toBe("created");
  });

  it("Same-user reconnect updates tokens safely without altering userId", async () => {
    const user = await createTestUser("User Reconnect");
    const googleSub = `google-sub-recon-${crypto.randomBytes(6).toString("hex")}`;

    const link1 = await linkGoogleAccount(
      {
        userId: user.id,
        googleSub,
        accessToken: "token-original",
        refreshToken: "refresh-orig",
      },
      prisma
    );
    expect(link1.success).toBe(true);
    expect(link1.action).toBe("created");

    const link2 = await linkGoogleAccount(
      {
        userId: user.id,
        googleSub,
        accessToken: "token-updated",
        refreshToken: "refresh-updated",
      },
      prisma
    );
    expect(link2.success).toBe(true);
    expect(link2.action).toBe("reconnected");

    const account = await prisma.account.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleSub,
        },
      },
    });

    expect(account.userId).toBe(user.id);
    expect(decryptToken(account.access_token)).toBe("token-updated");
    expect(decryptToken(account.refresh_token)).toBe("refresh-updated");
  });
});
