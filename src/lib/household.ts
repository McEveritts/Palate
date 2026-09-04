import { prisma } from "@/lib/db";
import { ensureUserProvisioned } from "@/lib/provisioning";
import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";

/**
 * Resolves the householdId for a given userId.
 * If the user has no household, auto-creates a solo household.
 * This is the central pivot point for the entire sharing architecture:
 * all recipe/vault operations use householdId instead of userId.
 */
export async function getHouseholdId(userId: string, db: PrismaClient = prisma): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { householdId: true, name: true },
  });

  if (user.householdId) return user.householdId;

  // Delegate to concurrency-safe ensureUserProvisioned to prevent duplicate orphan households
  await ensureUserProvisioned(userId, user.name, db);

  const refreshed = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { householdId: true },
  });

  return refreshed.householdId!;
}

/**
 * Generate a short, human-friendly invite code.
 * 8 uppercase hex characters (e.g., "A3F7B21C").
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}
