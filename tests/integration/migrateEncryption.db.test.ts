import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";
import { deriveKey } from "@/lib/encryption";
import {
  inspectEncryptionMigration,
  migrateUserConfigEncryption,
} from "@/lib/admin/migrateEncryption";

import { assertTestDatabaseEnv } from "./dbGuard";

const testDbUrl = process.env.TEST_DATABASE_URL;
const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";

// Safety guard: require exact database name 'palate_test'
assertTestDatabaseEnv(testDbUrl);

describe.skipIf(!isIntegrationEnabled)("UserConfig Encryption Migration Real PostgreSQL Integration Tests", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  const createdUserIds: string[] = [];

  const legacySecret = "legacy-test-secret-nextauth-32ch!";
  const primarySecret = "primary-test-secret-palate-32ch!";
  const origNextAuth = process.env.NEXTAUTH_SECRET;
  const origPalate = process.env.PALATE_ENCRYPTION_SECRET;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = legacySecret;
    process.env.PALATE_ENCRYPTION_SECRET = primarySecret;
    pool = new Pool({ connectionString: testDbUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (origNextAuth !== undefined) process.env.NEXTAUTH_SECRET = origNextAuth;
    else delete process.env.NEXTAUTH_SECRET;

    if (origPalate !== undefined) process.env.PALATE_ENCRYPTION_SECRET = origPalate;
    else delete process.env.PALATE_ENCRYPTION_SECRET;

    try {
      if (createdUserIds.length > 0) {
        await prisma.userConfig.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch {
      // Ignore
    }
    await prisma.$disconnect();
    await pool.end();
  });

  function encryptWithSecret(secret: string, text: string) {
    const key = deriveKey(secret);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return {
      encryptedString: encrypted,
      iv: iv.toString("hex"),
      authTag,
    };
  }

  async function createTestUserWithConfig(rawKey: string): Promise<string> {
    const userId = `test-cfg-user-${crypto.randomBytes(6).toString("hex")}`;
    await prisma.user.create({
      data: {
        id: userId,
        name: "Test UserConfig",
        email: `${userId}@example.test`,
      },
    });
    createdUserIds.push(userId);

    // Encrypted with legacySecret
    const enc = encryptWithSecret(legacySecret, rawKey);
    await prisma.userConfig.create({
      data: {
        userId,
        encryptedGcpKey: enc.encryptedString,
        iv: enc.iv,
        authTag: enc.authTag,
      },
    });

    return userId;
  }

  it("inspects, dry-runs, and migrates UserConfig encryption from legacy to primary secret", async () => {
    const userId = await createTestUserWithConfig("test-gemini-api-key-12345");

    // 1. Inspect
    const inspect = await inspectEncryptionMigration(prisma);
    expect(inspect.needsMigration).toBeGreaterThanOrEqual(1);

    // 2. Dry run
    const dryRun = await migrateUserConfigEncryption({ dryRun: true }, prisma);
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.migrated).toBeGreaterThanOrEqual(1);

    // 3. Live migration
    const live = await migrateUserConfigEncryption({ dryRun: false, confirmed: true }, prisma);
    expect(live.dryRun).toBe(false);
    expect(live.migrated).toBeGreaterThanOrEqual(1);

    // 4. Verify record is now decrypted by primary secret
    const updated = await prisma.userConfig.findUniqueOrThrow({ where: { userId } });
    const key = deriveKey(primarySecret);
    const iv = Buffer.from(updated.iv!, "hex");
    const authTag = Buffer.from(updated.authTag!, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(updated.encryptedGcpKey!, "hex", "utf8");
    decrypted += decipher.final("utf8");

    expect(decrypted).toBe("test-gemini-api-key-12345");
  });
});
