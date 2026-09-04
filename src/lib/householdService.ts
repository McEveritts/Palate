import "server-only";
import { prisma } from "@/lib/db";
import { getHouseholdId, generateInviteCode } from "@/lib/household";
import type { PrismaClient, Prisma } from "@prisma/client";

export class HouseholdServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "HouseholdServiceError";
  }
}

/**
 * Deterministically resolves a collision-free slug for migrating recipes into a target household.
 */
async function resolveUniqueRecipeSlug(
  tx: Prisma.TransactionClient,
  targetHouseholdId: string,
  baseSlug: string,
  userName?: string | null
): Promise<string> {
  const existing = await tx.recipe.findUnique({
    where: {
      householdId_slug: {
        householdId: targetHouseholdId,
        slug: baseSlug,
      },
    },
    select: { id: true },
  });

  if (!existing) {
    return baseSlug;
  }

  const cleanUser = (userName || "imported").toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidate = `${baseSlug}-${cleanUser}`;

  const userSlugExists = await tx.recipe.findUnique({
    where: {
      householdId_slug: {
        householdId: targetHouseholdId,
        slug: candidate,
      },
    },
    select: { id: true },
  });

  if (!userSlugExists) {
    return candidate;
  }

  let counter = 1;
  while (true) {
    const numbered = `${candidate}-${counter}`;
    const found = await tx.recipe.findUnique({
      where: {
        householdId_slug: {
          householdId: targetHouseholdId,
          slug: numbered,
        },
      },
      select: { id: true },
    });
    if (!found) {
      return numbered;
    }
    counter++;
  }
}

/**
 * Creates a new household invite.
 * Uses an exclusive row lock on Household to strictly serialize concurrent invite creations,
 * ensuring exactly one active invite remains.
 */
export async function createHouseholdInvite(
  userId: string,
  db: PrismaClient = prisma
): Promise<{ success: boolean; code: string; expiresAt: string }> {
  const householdId = await getHouseholdId(userId, db);
  const inviteCode = generateInviteCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  await db.$transaction(async (tx) => {
    // 1. Exclusive row lock on Household to prevent concurrent race conditions
    await tx.$executeRaw`SELECT id FROM "Household" WHERE id = ${householdId} FOR UPDATE`;

    // 2. Invalidate any existing active invite codes for this household
    await tx.inviteCode.updateMany({
      where: {
        householdId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(),
      },
    });

    // 3. Create the new single active invite
    await tx.inviteCode.create({
      data: {
        code: inviteCode,
        householdId,
        createdBy: userId,
        expiresAt,
      },
    });
  });

  return {
    success: true,
    code: inviteCode,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Redeems an invite code to join a household.
 * If joining user is the sole member of a solo household, personal recipes are safely migrated
 * with collision handling, guaranteeing zero recipe loss.
 */
export async function redeemHouseholdInvite(
  userId: string,
  code: string,
  db: PrismaClient = prisma
): Promise<{ success: boolean; message: string }> {
  if (!code || typeof code !== "string" || code.trim().length !== 8) {
    throw new HouseholdServiceError("invalid_code_format", "Invalid invite code format.", 400);
  }

  const cleanCode = code.trim().toUpperCase();

  const invite = await db.inviteCode.findUnique({
    where: { code: cleanCode },
  });

  if (!invite) {
    throw new HouseholdServiceError("invite_not_found", "Invite code not found.", 404);
  }

  if (invite.usedAt) {
    throw new HouseholdServiceError("invite_already_used", "This invite code has already been used.", 400);
  }

  if (invite.expiresAt < new Date()) {
    throw new HouseholdServiceError("invite_expired", "This invite code has expired.", 400);
  }

  if (invite.createdBy === userId) {
    throw new HouseholdServiceError("cannot_redeem_own_invite", "You cannot redeem your own invite code.", 400);
  }

  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { householdId: true, name: true },
  });

  if (currentUser?.householdId === invite.householdId) {
    throw new HouseholdServiceError("already_member", "You are already a member of this household.", 400);
  }

  const oldHouseholdId = currentUser?.householdId;

  // Execute atomic redemption and recipe migration in transaction
  const joined = await db.$transaction(async (tx) => {
    // 1. Atomically consume the invite
    const updated = await tx.inviteCode.updateMany({
      where: {
        id: invite.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
        usedBy: userId,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    // 2. If user was sole member of a solo household, migrate all recipes without loss
    if (oldHouseholdId) {
      const oldMemberCount = await tx.user.count({
        where: { householdId: oldHouseholdId },
      });

      if (oldMemberCount === 1) {
        const personalRecipes = await tx.recipe.findMany({
          where: { householdId: oldHouseholdId },
        });

        for (const recipe of personalRecipes) {
          const newSlug = await resolveUniqueRecipeSlug(
            tx,
            invite.householdId,
            recipe.slug,
            currentUser.name
          );

          await tx.recipe.update({
            where: { id: recipe.id },
            data: {
              householdId: invite.householdId,
              slug: newSlug,
            },
          });
        }

        // Clean up empty old household record after all recipes have been safely migrated
        await tx.household.delete({
          where: { id: oldHouseholdId },
        });
      }
    }

    // 3. Move user into new household
    await tx.user.update({
      where: { id: userId },
      data: { householdId: invite.householdId },
    });

    return true;
  });

  if (!joined) {
    throw new HouseholdServiceError("invite_expired_or_used", "This invite code has already been used or has expired.", 400);
  }

  return {
    success: true,
    message: "Successfully joined the household!",
  };
}

/**
 * Removes a member from the household and moves them into a new personal kitchen.
 */
export async function removeHouseholdMember(
  requestingUserId: string,
  memberId: string,
  db: PrismaClient = prisma
): Promise<{ success: boolean; message: string; removedMemberId: string }> {
  if (!memberId || typeof memberId !== "string") {
    throw new HouseholdServiceError("invalid_member_id", "Invalid member ID.", 400);
  }

  if (memberId === requestingUserId) {
    throw new HouseholdServiceError(
      "cannot_remove_self",
      "You cannot remove yourself. Please use the Leave Household option instead.",
      400
    );
  }

  const householdId = await getHouseholdId(requestingUserId, db);

  const memberUser = await db.user.findUnique({
    where: { id: memberId },
    select: { id: true, householdId: true, name: true },
  });

  if (!memberUser || memberUser.householdId !== householdId) {
    throw new HouseholdServiceError("member_not_found", "Member not found in your household.", 404);
  }

  // Create a new solo household for the removed user
  await db.household.create({
    data: {
      name: `${memberUser.name ?? "My"}'s Kitchen`,
      members: { connect: { id: memberId } },
    },
  });

  return {
    success: true,
    message: "Member successfully removed from the household.",
    removedMemberId: memberId,
  };
}

/**
 * Leaves the current household and creates a new personal solo kitchen.
 */
export async function leaveHousehold(
  userId: string,
  db: PrismaClient = prisma
): Promise<{ success: boolean; message: string; newHouseholdId: string }> {
  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { householdId: true, name: true },
  });

  if (!currentUser?.householdId) {
    throw new HouseholdServiceError("not_in_household", "You are not in a household.", 400);
  }

  const memberCount = await db.user.count({
    where: { householdId: currentUser.householdId },
  });

  if (memberCount <= 1) {
    return {
      success: true,
      message: "You are already in your own personal kitchen.",
      newHouseholdId: currentUser.householdId,
    };
  }

  // Create a new solo household for the departing user
  const newHousehold = await db.household.create({
    data: {
      name: `${currentUser.name ?? "My"}'s Kitchen`,
      members: { connect: { id: userId } },
    },
  });

  return {
    success: true,
    message: "You have left the household. A new personal kitchen has been created.",
    newHouseholdId: newHousehold.id,
  };
}
