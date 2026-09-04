import "server-only";
import { prisma } from "../db";
import { encryptToken, decryptToken, classifyToken } from "../tokenEncryption";

export interface GoogleTokenInspectionResult {
  totalGoogleAccounts: number;
  primaryKeyEncrypted: number;
  plaintextLegacy: number;
  malformed: number;
  unreadable: number;
  alreadyEncrypted: number; // alias for primaryKeyEncrypted
  needsEncryption: number; // alias for plaintextLegacy
}

export interface GoogleTokenMigrationResult {
  totalAccounts: number;
  alreadyEncrypted: number;
  newlyEncrypted: number;
  unreadableSkipped: number;
  malformedSkipped: number;
  casSkipped: number;
  dryRun: boolean;
}

/**
 * Inspects all Google accounts in the database to classify how many have tokens
 * encrypted at rest vs plaintext vs unreadable vs malformed using authenticated decryption.
 * Returns aggregate counts only.
 */
export async function inspectGoogleTokenMigration(
  db: typeof prisma = prisma
): Promise<GoogleTokenInspectionResult> {
  const accounts = await db.account.findMany({
    where: { provider: "google" },
    select: { id: true, access_token: true, refresh_token: true },
  });

  let primaryKeyEncrypted = 0;
  let plaintextLegacy = 0;
  let malformed = 0;
  let unreadable = 0;

  for (const acc of accounts) {
    const accessClass = classifyToken(acc.access_token);
    const refreshClass = classifyToken(acc.refresh_token);

    if (accessClass === "malformed" || refreshClass === "malformed") {
      malformed++;
    } else if (accessClass === "unreadable" || refreshClass === "unreadable") {
      unreadable++;
    } else if (
      (accessClass === "primaryKeyEncrypted" || !acc.access_token) &&
      (refreshClass === "primaryKeyEncrypted" || !acc.refresh_token)
    ) {
      primaryKeyEncrypted++;
    } else {
      plaintextLegacy++;
    }
  }

  return {
    totalGoogleAccounts: accounts.length,
    primaryKeyEncrypted,
    plaintextLegacy,
    malformed,
    unreadable,
    alreadyEncrypted: primaryKeyEncrypted,
    needsEncryption: plaintextLegacy,
  };
}

/**
 * Idempotent, concurrency-safe migration utility that encrypts legacy plaintext
 * Google OAuth tokens at rest using AES-256-GCM.
 *
 * Safety properties:
 * - Pre-validates in-memory roundtrip decryption before touching the database.
 * - Uses compare-and-swap update predicates to prevent concurrent overwrites.
 * - Resumable and safe to run multiple times.
 * - Requires explicit confirmation flag for non-dry-run mode.
 * - Reports aggregate counts only. Never prints tokens or secrets.
 */
export async function migrateGoogleTokens(
  options: { dryRun?: boolean; confirmed?: boolean } = {},
  db: typeof prisma = prisma
): Promise<GoogleTokenMigrationResult> {
  const dryRun = options.dryRun !== false; // defaults to true
  if (!dryRun && !options.confirmed) {
    throw new Error(
      "Refusing to execute live token encryption without explicit confirmed: true flag."
    );
  }

  const accounts = await db.account.findMany({
    where: { provider: "google" },
    select: { id: true, access_token: true, refresh_token: true },
  });

  let alreadyEncrypted = 0;
  let newlyEncrypted = 0;
  let unreadableSkipped = 0;
  let malformedSkipped = 0;
  let casSkipped = 0;

  for (const acc of accounts) {
    const accessClass = classifyToken(acc.access_token);
    const refreshClass = classifyToken(acc.refresh_token);

    if (accessClass === "malformed" || refreshClass === "malformed") {
      malformedSkipped++;
      continue;
    }

    if (accessClass === "unreadable" || refreshClass === "unreadable") {
      unreadableSkipped++;
      continue;
    }

    if (
      (accessClass === "primaryKeyEncrypted" || !acc.access_token) &&
      (refreshClass === "primaryKeyEncrypted" || !acc.refresh_token)
    ) {
      alreadyEncrypted++;
      continue;
    }

    // Prepare encrypted versions
    let newAccessToken = acc.access_token;
    if (acc.access_token && accessClass === "plaintextLegacy") {
      newAccessToken = encryptToken(acc.access_token);
      // Pre-commit verification: verify decryption matches original in memory
      const roundtrip = decryptToken(newAccessToken);
      if (roundtrip !== acc.access_token) {
        throw new Error(
          "Pre-commit token verification failed: roundtrip decryption did not match plaintext."
        );
      }
    }

    let newRefreshToken = acc.refresh_token;
    if (acc.refresh_token && refreshClass === "plaintextLegacy") {
      newRefreshToken = encryptToken(acc.refresh_token);
      // Pre-commit verification: verify decryption matches original in memory
      const roundtrip = decryptToken(newRefreshToken);
      if (roundtrip !== acc.refresh_token) {
        throw new Error(
          "Pre-commit token verification failed: roundtrip decryption did not match plaintext."
        );
      }
    }

    if (!dryRun) {
      // Atomic Compare-And-Swap (CAS) update:
      // Only updates if access_token and refresh_token match what we read
      const updateResult = await db.account.updateMany({
        where: {
          id: acc.id,
          access_token: acc.access_token,
          refresh_token: acc.refresh_token,
        },
        data: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
        },
      });

      if (updateResult.count === 1) {
        newlyEncrypted++;
      } else {
        // Row was modified concurrently
        casSkipped++;
      }
    } else {
      newlyEncrypted++;
    }
  }

  return {
    totalAccounts: accounts.length,
    alreadyEncrypted,
    newlyEncrypted,
    unreadableSkipped,
    malformedSkipped,
    casSkipped,
    dryRun,
  };
}
