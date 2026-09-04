import "server-only";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

export interface LinkIdentityParams {
  palateUserId: string;
  jellyfinServerId: string;
  jellyfinUserId: string;
  jellyfinUsername: string;
}

export interface LinkIdentityResult {
  success: boolean;
  userId: string;
  alreadyLinked: boolean;
  message: string;
}

/**
 * Idempotent administrative account-linking utility.
 *
 * Links an existing Palate user (e.g. created during Google OAuth era) to a JellyfinIdentity.
 * Preserves all user data: recipes, schedules, UserConfig, household membership, and logs.
 *
 * CRITICAL SAFETY RULES:
 * - Never merges automatically by matching email or username.
 * - Fails if the Jellyfin identity is already associated with a different Palate user.
 * - Fails if the Palate user already has a different Jellyfin identity.
 */
export async function linkPalateUserToJellyfin(
  params: LinkIdentityParams,
  db: PrismaClient = prisma
): Promise<LinkIdentityResult> {
  const { palateUserId, jellyfinServerId, jellyfinUserId, jellyfinUsername } = params;

  if (!palateUserId || !jellyfinServerId || !jellyfinUserId || !jellyfinUsername) {
    throw new Error("Missing required parameters for account linking.");
  }

  return await db.$transaction(async (tx) => {
    // 1. Verify target Palate user exists
    const user = await tx.user.findUnique({
      where: { id: palateUserId },
      include: { jellyfinIdentity: true },
    });

    if (!user) {
      throw new Error(`Palate user not found for ID: ${palateUserId}`);
    }

    // 2. Check if this exact Jellyfin identity is already linked
    const existingIdentity = await tx.jellyfinIdentity.findUnique({
      where: {
        jellyfinServerId_jellyfinUserId: {
          jellyfinServerId,
          jellyfinUserId,
        },
      },
    });

    if (existingIdentity) {
      if (existingIdentity.userId === palateUserId) {
        // Idempotent success: update username if changed
        if (existingIdentity.jellyfinUsername !== jellyfinUsername) {
          await tx.jellyfinIdentity.update({
            where: { id: existingIdentity.id },
            data: { jellyfinUsername },
          });
          await tx.user.update({
            where: { id: palateUserId },
            data: { name: jellyfinUsername },
          });
        }
        return {
          success: true,
          userId: palateUserId,
          alreadyLinked: true,
          message: "Account already linked to this Jellyfin identity (idempotent).",
        };
      }

      throw new Error(
        `Jellyfin identity (${jellyfinServerId}:${jellyfinUserId}) is already linked to another Palate user (${existingIdentity.userId}). Manual administrative review required.`
      );
    }

    // 3. Check if target user already has a different Jellyfin identity
    if (user.jellyfinIdentity) {
      throw new Error(
        `Palate user (${palateUserId}) already has an associated Jellyfin identity (${user.jellyfinIdentity.jellyfinServerId}:${user.jellyfinIdentity.jellyfinUserId}). Cannot overwrite.`
      );
    }

    // 4. Create JellyfinIdentity and update user display name while preserving all other records
    await tx.jellyfinIdentity.create({
      data: {
        userId: palateUserId,
        jellyfinServerId,
        jellyfinUserId,
        jellyfinUsername,
        lastAuthenticatedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: palateUserId },
      data: {
        name: jellyfinUsername,
      },
    });

    return {
      success: true,
      userId: palateUserId,
      alreadyLinked: false,
      message: "Successfully linked Palate user to Jellyfin identity. All user data preserved.",
    };
  });
}

export interface IdentityCollisionReport {
  totalGoogleAccounts: number;
  distinctGoogleUsers: number;
  alreadyLinked: number;
  unlinkedMatchingEmail: number;
  unlinkedMatchingUsername: number;
  unlinkedNoMatch: number;
}

/**
 * Read-only count of users who have historical Google accounts and whether they
 * currently lack a JellyfinIdentity. Returns aggregate counts only; never reveals
 * usernames, emails, or personal data.
 */
export async function countGoogleUsers(
  db: PrismaClient = prisma
): Promise<{ totalGoogleAccounts: number; unlinkedGoogleUsers: number }> {
  const googleAccounts = await db.account.findMany({
    where: { provider: "google" },
    select: { userId: true },
  });

  const totalGoogleAccounts = googleAccounts.length;
  const userIds = Array.from(new Set(googleAccounts.map((a) => a.userId)));

  if (userIds.length === 0) {
    return { totalGoogleAccounts: 0, unlinkedGoogleUsers: 0 };
  }

  const linkedCount = await db.jellyfinIdentity.count({
    where: {
      userId: { in: userIds },
    },
  });

  return {
    totalGoogleAccounts,
    unlinkedGoogleUsers: userIds.length - linkedCount,
  };
}

/**
 * Read-only aggregate report on identity collision and linking status across Google-era users.
 * Never logs or prints emails, usernames, or PII.
 */
export async function reportIdentityCollisions(
  db: PrismaClient = prisma
): Promise<IdentityCollisionReport> {
  const googleAccounts = await db.account.findMany({
    where: { provider: "google" },
    select: { userId: true },
  });

  const distinctGoogleUserIds = Array.from(new Set(googleAccounts.map((a) => a.userId)));
  if (distinctGoogleUserIds.length === 0) {
    return {
      totalGoogleAccounts: 0,
      distinctGoogleUsers: 0,
      alreadyLinked: 0,
      unlinkedMatchingEmail: 0,
      unlinkedMatchingUsername: 0,
      unlinkedNoMatch: 0,
    };
  }

  const googleUsers = await db.user.findMany({
    where: { id: { in: distinctGoogleUserIds } },
    include: { jellyfinIdentity: true },
  });

  const jellyfinIdentities = await db.jellyfinIdentity.findMany({
    include: { user: true },
  });

  let alreadyLinked = 0;
  let unlinkedMatchingEmail = 0;
  let unlinkedMatchingUsername = 0;
  let unlinkedNoMatch = 0;

  for (const gUser of googleUsers) {
    if (gUser.jellyfinIdentity) {
      alreadyLinked++;
      continue;
    }

    let emailMatched = false;
    let usernameMatched = false;

    if (gUser.email) {
      const emailMatch = jellyfinIdentities.find(
        (ji) => ji.user.email && ji.user.email.toLowerCase() === gUser.email!.toLowerCase()
      );
      if (emailMatch) emailMatched = true;
    }

    if (gUser.name) {
      const nameMatch = jellyfinIdentities.find(
        (ji) => ji.jellyfinUsername.toLowerCase() === gUser.name!.toLowerCase()
      );
      if (nameMatch) usernameMatched = true;
    }

    if (emailMatched) {
      unlinkedMatchingEmail++;
    } else if (usernameMatched) {
      unlinkedMatchingUsername++;
    } else {
      unlinkedNoMatch++;
    }
  }

  return {
    totalGoogleAccounts: googleAccounts.length,
    distinctGoogleUsers: distinctGoogleUserIds.length,
    alreadyLinked,
    unlinkedMatchingEmail,
    unlinkedMatchingUsername,
    unlinkedNoMatch,
  };
}
