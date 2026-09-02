import { prisma } from "@/lib/db";

/**
 * Idempotently and transactionally ensures that a user has a default UserConfig and belongs to a Household.
 * Concurrency-safe against simultaneous logins racing to create duplicate households.
 * Throws on failure to ensure incomplete provisioning is never silently ignored.
 *
 * @param userId - Internal Palate User.id
 * @param name - Optional display name of the user
 */
export async function ensureUserProvisioned(userId: string, name?: string | null): Promise<void> {
  if (!userId) {
    throw new Error("Cannot provision user without a valid userId");
  }

  await prisma.$transaction(async (tx) => {
    // 1. Concurrency-safe upsert for default UserConfig
    await tx.userConfig.upsert({
      where: { userId },
      create: {
        userId,
        metricSystem: false,
      },
      update: {},
    });

    // 2. Concurrency-safe check and assignment for Household
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { householdId: true, name: true },
    });

    if (!user.householdId) {
      const displayName = name ?? user.name ?? "My";
      const household = await tx.household.create({
        data: {
          name: `${displayName}'s Kitchen`,
        },
      });

      // Atomically update user only if householdId is still null (protects against concurrent race)
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          householdId: null,
        },
        data: {
          householdId: household.id,
        },
      });

      // If a concurrent transaction won the race and set householdId first, delete the redundant household
      if (updated.count === 0) {
        await tx.household.delete({
          where: { id: household.id },
        });
      }
    }
  });
}
