import { prisma } from "@/lib/db";
import crypto from "crypto";

/**
 * Resolves the householdId for a given userId.
 * If the user has no household, auto-creates a solo household.
 * This is the central pivot point for the entire sharing architecture:
 * all recipe/vault operations use householdId instead of userId.
 */
export async function getHouseholdId(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { householdId: true, name: true },
  });

  if (user.householdId) return user.householdId;

  // Auto-create a solo household for users who don't have one yet
  // (handles migration edge case and new users before they name their kitchen)
  const household = await prisma.household.create({
    data: {
      name: `${user.name ?? "My"}'s Kitchen`,
      members: { connect: { id: userId } },
    },
  });

  return household.id;
}

/**
 * Generate a short, human-friendly invite code.
 * 8 uppercase hex characters (e.g., "A3F7B21C").
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}
