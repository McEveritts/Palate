import "server-only";
import { prisma } from "@/lib/db";
import { encryptKey, deriveDomainKey, deriveRawKey } from "@/lib/encryption";
import { timingSafeEqualStrings } from "@/lib/cronAuth";
import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

export interface MigrationInspectionResult {
  totalEncryptedKeys: number;
  alreadyMigrated: number;
  needsMigration: number;
  unreadable: number;
  incompleteTriples: number;
}

export interface MigrationExecutionResult {
  total: number;
  migrated: number;
  skipped: number;
  casSkipped: number;
  errors: number;
  dryRun: boolean;
}

/**
 * Checks whether a specific ciphertext record was encrypted with a specific key.
 * Decrypts in memory; never exposes or returns plaintext.
 */
function tryDecryptWithKey(
  key: Buffer,
  encryptedString: string,
  ivHex: string,
  authTagHex: string
): string | null {
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedString, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Read-only inspection of encryption state across all UserConfig records.
 * Returns aggregate metrics only; never logs keys, connection strings, or plaintexts.
 */
export async function inspectEncryptionMigration(
  db: PrismaClient = prisma
): Promise<MigrationInspectionResult> {
  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;
  const legacySecret = process.env.NEXTAUTH_SECRET;

  if (!primarySecret) {
    throw new Error("PALATE_ENCRYPTION_SECRET must be set to inspect encryption status.");
  }

  if (legacySecret && timingSafeEqualStrings(primarySecret, legacySecret)) {
    throw new Error("PALATE_ENCRYPTION_SECRET and NEXTAUTH_SECRET must not share the same value.");
  }

  const primaryDomainKey = deriveDomainKey(primarySecret);
  const primaryRawKey = deriveRawKey(primarySecret);
  const legDomainKey = legacySecret ? deriveDomainKey(legacySecret) : null;
  const legRawKey = legacySecret ? deriveRawKey(legacySecret) : null;

  // Find all configs that have ANY key-related field set (including partial/incomplete records)
  const configs = await db.userConfig.findMany({
    where: {
      OR: [
        { encryptedGcpKey: { not: null } },
        { iv: { not: null } },
        { authTag: { not: null } },
      ],
    },
    select: {
      userId: true,
      encryptedGcpKey: true,
      iv: true,
      authTag: true,
    },
  });

  let alreadyMigrated = 0;
  let needsMigration = 0;
  let unreadable = 0;
  let incompleteTriples = 0;

  for (const config of configs) {
    // Check for incomplete triple (one or two nulls)
    if (!config.encryptedGcpKey || !config.iv || !config.authTag) {
      incompleteTriples++;
      unreadable++;
      continue;
    }

    // 1. Already migrated: decryptable with domain-derived primary secret
    if (tryDecryptWithKey(primaryDomainKey, config.encryptedGcpKey, config.iv, config.authTag) !== null) {
      alreadyMigrated++;
      continue;
    }

    // 2. Earlier raw-SHA primary secret: needs migration to domain format
    if (tryDecryptWithKey(primaryRawKey, config.encryptedGcpKey, config.iv, config.authTag) !== null) {
      needsMigration++;
      continue;
    }

    // 3. Legacy NEXTAUTH_SECRET: needs migration
    if (legacySecret && !timingSafeEqualStrings(primarySecret, legacySecret)) {
      if (
        (legDomainKey && tryDecryptWithKey(legDomainKey, config.encryptedGcpKey, config.iv, config.authTag) !== null) ||
        (legRawKey && tryDecryptWithKey(legRawKey, config.encryptedGcpKey, config.iv, config.authTag) !== null)
      ) {
        needsMigration++;
        continue;
      }
    }

    unreadable++;
  }

  return {
    totalEncryptedKeys: configs.length,
    alreadyMigrated,
    needsMigration,
    unreadable,
    incompleteTriples,
  };
}

/**
 * Migrates UserConfig credentials to domain-separated PALATE_ENCRYPTION_SECRET.
 * Requires pre-commit roundtrip verification and atomic Compare-And-Swap (CAS).
 */
export async function migrateUserConfigEncryption(
  options: { dryRun?: boolean; confirmed?: boolean } = {},
  db: PrismaClient = prisma
): Promise<MigrationExecutionResult> {
  const { dryRun = true, confirmed = false } = options;

  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;
  const legacySecret = process.env.NEXTAUTH_SECRET;

  if (!primarySecret) {
    throw new Error("FATAL: PALATE_ENCRYPTION_SECRET must be configured before running migration.");
  }

  if (legacySecret && timingSafeEqualStrings(primarySecret, legacySecret)) {
    throw new Error("FATAL: PALATE_ENCRYPTION_SECRET and NEXTAUTH_SECRET must not share the same value.");
  }

  if (!dryRun && !confirmed) {
    throw new Error("FATAL: Live migration requires explicit confirmation flag ({ confirmed: true }).");
  }

  const primaryDomainKey = deriveDomainKey(primarySecret);
  const primaryRawKey = deriveRawKey(primarySecret);
  const legDomainKey = legacySecret ? deriveDomainKey(legacySecret) : null;
  const legRawKey = legacySecret ? deriveRawKey(legacySecret) : null;

  const configs = await db.userConfig.findMany({
    where: {
      encryptedGcpKey: { not: null },
      iv: { not: null },
      authTag: { not: null },
    },
  });

  let migrated = 0;
  let skipped = 0;
  let casSkipped = 0;
  let errors = 0;

  for (const config of configs) {
    try {
      // 1. Check if already migrated to new domain format
      if (tryDecryptWithKey(primaryDomainKey, config.encryptedGcpKey!, config.iv!, config.authTag!) !== null) {
        skipped++;
        continue;
      }

      // 2. Attempt decryption from earlier formats:
      // a. Intermediate raw-SHA PALATE_ENCRYPTION_SECRET
      let plaintext = tryDecryptWithKey(primaryRawKey, config.encryptedGcpKey!, config.iv!, config.authTag!);

      // b. Legacy NEXTAUTH_SECRET (domain or raw)
      if (plaintext === null && legDomainKey) {
        plaintext = tryDecryptWithKey(legDomainKey, config.encryptedGcpKey!, config.iv!, config.authTag!);
      }
      if (plaintext === null && legRawKey) {
        plaintext = tryDecryptWithKey(legRawKey, config.encryptedGcpKey!, config.iv!, config.authTag!);
      }

      if (plaintext === null) {
        errors++;
        continue;
      }

      // 3. Re-encrypt using primary domain key
      const reEncrypted = encryptKey(plaintext);

      // 4. Pre-commit roundtrip verification
      const roundtrip = tryDecryptWithKey(
        primaryDomainKey,
        reEncrypted.encryptedString,
        reEncrypted.iv,
        reEncrypted.authTag
      );
      if (roundtrip !== plaintext) {
        throw new Error("Verification failed: roundtrip decryption did not match plaintext.");
      }

      // 5. Atomic CAS update
      if (!dryRun) {
        const casResult = await db.userConfig.updateMany({
          where: {
            id: config.id,
            encryptedGcpKey: config.encryptedGcpKey,
            iv: config.iv,
            authTag: config.authTag,
          },
          data: {
            encryptedGcpKey: reEncrypted.encryptedString,
            iv: reEncrypted.iv,
            authTag: reEncrypted.authTag,
          },
        });

        if (casResult.count === 0) {
          casSkipped++;
          continue;
        }
      }

      migrated++;
    } catch (err) {
      console.error("[Migration Error]", err);
      errors++;
    }
  }

  return {
    total: configs.length,
    migrated,
    skipped,
    casSkipped,
    errors,
    dryRun,
  };
}
