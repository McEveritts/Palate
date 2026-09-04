import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  inspectEncryptionMigration,
  migrateUserConfigEncryption,
} from "./migrateEncryption";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function encryptWithSecret(secret: string, text: string) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedString: encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

function encryptWithDomain(secret: string, text: string) {
  const key = crypto.createHmac("sha256", secret).update("palate:gemini-api-key:v1").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedString: encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

describe("Administrative Encryption Migration Service", () => {
  const PRIMARY_SECRET = "primary-encryption-secret-32b-min";
  const LEGACY_SECRET = "legacy-nextauth-secret-32b-min";
  const originalEnv = process.env;

  let mockDb: any;
  let userConfigs: any[];

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PALATE_ENCRYPTION_SECRET: PRIMARY_SECRET,
      NEXTAUTH_SECRET: LEGACY_SECRET,
    };

    userConfigs = [];

    mockDb = {
      userConfig: {
        findMany: vi.fn(async () => [...userConfigs]),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const idx = userConfigs.findIndex((c) => c.userId === where.userId || c.id === where.id);
          if (idx >= 0) {
            userConfigs[idx] = { ...userConfigs[idx], ...data };
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("inspects encryption status across UserConfig records without exposing keys", async () => {
    // 1 record encrypted with primary secret domain key
    const primaryEnc = encryptWithDomain(PRIMARY_SECRET, "gemini-key-1");
    userConfigs.push({
      userId: "user-1",
      encryptedGcpKey: primaryEnc.encryptedString,
      iv: primaryEnc.iv,
      authTag: primaryEnc.authTag,
    });

    // 2 records encrypted with legacy secret
    const legacyEnc1 = encryptWithSecret(LEGACY_SECRET, "gemini-key-2");
    userConfigs.push({
      userId: "user-2",
      encryptedGcpKey: legacyEnc1.encryptedString,
      iv: legacyEnc1.iv,
      authTag: legacyEnc1.authTag,
    });

    const legacyEnc2 = encryptWithSecret(LEGACY_SECRET, "gemini-key-3");
    userConfigs.push({
      userId: "user-3",
      encryptedGcpKey: legacyEnc2.encryptedString,
      iv: legacyEnc2.iv,
      authTag: legacyEnc2.authTag,
    });

    // 1 corrupt/unknown record
    userConfigs.push({
      userId: "user-4",
      encryptedGcpKey: "corrupted-hex",
      iv: "bad-iv",
      authTag: "bad-tag",
    });

    const report = await inspectEncryptionMigration(mockDb);

    expect(report.totalEncryptedKeys).toBe(4);
    expect(report.alreadyMigrated).toBe(1);
    expect(report.needsMigration).toBe(2);
    expect(report.unreadable).toBe(1);
  });

  it("performs dry run without mutating the database", async () => {
    const legacyEnc = encryptWithSecret(LEGACY_SECRET, "gemini-key-secret");
    userConfigs.push({
      userId: "user-legacy",
      encryptedGcpKey: legacyEnc.encryptedString,
      iv: legacyEnc.iv,
      authTag: legacyEnc.authTag,
    });

    const result = await migrateUserConfigEncryption({ dryRun: true }, mockDb);

    expect(result.dryRun).toBe(true);
    expect(result.total).toBe(1);
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // Database update was NOT called in dry run
    expect(mockDb.userConfig.updateMany).not.toHaveBeenCalled();
    // Record remains encrypted under legacy secret
    expect(userConfigs[0].encryptedGcpKey).toBe(legacyEnc.encryptedString);
  });

  it("migrates legacy records to primary secret and updates the database", async () => {
    const legacyEnc = encryptWithSecret(LEGACY_SECRET, "test-raw-gemini-key");
    userConfigs.push({
      id: "cfg-1",
      userId: "user-legacy",
      encryptedGcpKey: legacyEnc.encryptedString,
      iv: legacyEnc.iv,
      authTag: legacyEnc.authTag,
    });

    const result = await migrateUserConfigEncryption({ dryRun: false, confirmed: true }, mockDb);

    expect(result.dryRun).toBe(false);
    expect(result.migrated).toBe(1);
    expect(mockDb.userConfig.updateMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      data: expect.objectContaining({
        encryptedGcpKey: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
      }),
    });

    // Verify migrated ciphertext is now decryptable with primary secret domain key
    const updated = userConfigs[0];
    const key = crypto.createHmac("sha256", PRIMARY_SECRET).update("palate:gemini-api-key:v1").digest();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(updated.iv, "hex"));
    decipher.setAuthTag(Buffer.from(updated.authTag, "hex"));
    let decrypted = decipher.update(updated.encryptedGcpKey, "hex", "utf8");
    decrypted += decipher.final("utf8");

    expect(decrypted).toBe("test-raw-gemini-key");
  });
});
