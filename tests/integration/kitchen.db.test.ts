import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";
import { ensureUserProvisioned } from "@/lib/provisioning";
import { getHouseholdId, generateInviteCode } from "@/lib/household";
import {
  createHouseholdInvite,
  redeemHouseholdInvite,
  removeHouseholdMember,
  leaveHousehold,
  HouseholdServiceError,
} from "@/lib/householdService";
import { assertTestDatabaseEnv } from "./dbGuard";

const testDbUrl = process.env.TEST_DATABASE_URL;
const isIntegrationEnabled = process.env.RUN_DB_INTEGRATION === "true";

// Safety guard: require exact database name 'palate_test'
assertTestDatabaseEnv(testDbUrl);

describe.skipIf(!isIntegrationEnabled)("Kitchen & Household Real PostgreSQL Integration Tests", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  const createdUserIds: string[] = [];
  const createdHouseholdIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDbUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await prisma.scheduledMeal.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.recipe.deleteMany({ where: { householdId: { in: createdHouseholdIds } } });
        await prisma.inviteCode.deleteMany({ where: { createdBy: { in: createdUserIds } } });
        await prisma.jellyfinIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.userConfig.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdHouseholdIds.length > 0) {
        await prisma.household.deleteMany({ where: { id: { in: createdHouseholdIds } } });
      }
    } catch {
      // Ignore cleanup errors
    }
    await prisma.$disconnect();
    await pool.end();
  });

  async function createTestUser(name: string, withJellyfin = true): Promise<{ id: string; name: string }> {
    const id = `test-user-${crypto.randomBytes(6).toString("hex")}`;
    const user = await prisma.user.create({
      data: {
        id,
        name,
        email: `${id}@example.test`,
      },
    });
    createdUserIds.push(user.id);

    if (withJellyfin) {
      const jfId = `jf-${crypto.randomBytes(6).toString("hex")}`;
      await prisma.jellyfinIdentity.create({
        data: {
          userId: user.id,
          jellyfinServerId: "test-jellyfin-server-id",
          jellyfinUserId: jfId,
          jellyfinUsername: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        },
      });
    }

    return { id: user.id, name: user.name ?? name };
  }

  // 1. User auto-provisions with a personal household
  it("Scenario 1: User auto-provisions with a personal household", async () => {
    const user = await createTestUser("Chef Alice");
    await ensureUserProvisioned(user.id, user.name, prisma);

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { household: true, jellyfinIdentity: true },
    });

    expect(refreshed.householdId).toBeTruthy();
    expect(refreshed.household).not.toBeNull();
    expect(refreshed.household!.name).toBe("Chef Alice's Kitchen");
    expect(refreshed.jellyfinIdentity).not.toBeNull();
    createdHouseholdIds.push(refreshed.householdId!);
  });

  // 2. Concurrent provisioning is idempotent
  it("Scenario 2: Concurrent provisioning is idempotent without creating orphan households", async () => {
    const bobName = `Chef Bob ${crypto.randomBytes(4).toString("hex")}`;
    const user = await createTestUser(bobName);

    // Launch 5 concurrent provisioning calls
    await Promise.all([
      ensureUserProvisioned(user.id, user.name, prisma),
      ensureUserProvisioned(user.id, user.name, prisma),
      ensureUserProvisioned(user.id, user.name, prisma),
      ensureUserProvisioned(user.id, user.name, prisma),
      ensureUserProvisioned(user.id, user.name, prisma),
    ]);

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { household: { include: { members: true } } },
    });

    expect(refreshed.householdId).toBeTruthy();
    expect(refreshed.household!.members.length).toBe(1);
    createdHouseholdIds.push(refreshed.householdId!);

    // Ensure no orphan households exist with Bob's name but 0 members
    const allMatching = await prisma.household.findMany({
      where: { name: `${bobName}'s Kitchen` },
      include: { members: true },
    });

    const orphanCount = allMatching.filter((h) => h.members.length === 0).length;
    expect(orphanCount).toBe(0);
  });

  // 3. User can update kitchen profile name
  it("Scenario 3: User can update kitchen profile name", async () => {
    const user = await createTestUser("Chef Charlie");
    const householdId = await getHouseholdId(user.id, prisma);
    createdHouseholdIds.push(householdId);

    const updated = await prisma.household.update({
      where: { id: householdId },
      data: { name: "The Gourmet Bistro" },
    });

    expect(updated.name).toBe("The Gourmet Bistro");
  });

  // 4. Production Service: Household owner generates invite via createHouseholdInvite
  it("Scenario 4: Household owner generates invite via createHouseholdInvite", async () => {
    const user = await createTestUser("Chef Diana");
    const householdId = await getHouseholdId(user.id, prisma);
    createdHouseholdIds.push(householdId);

    const invite = await createHouseholdInvite(user.id, prisma);
    expect(invite.success).toBe(true);
    expect(invite.code).toHaveLength(8);

    const dbInvite = await prisma.inviteCode.findUniqueOrThrow({ where: { code: invite.code } });
    expect(dbInvite.householdId).toBe(householdId);
    expect(dbInvite.usedAt).toBeNull();
  });

  // 5. Concurrency: Two simultaneous invite creations serialize and leave exactly one active invite
  it("Scenario 5: Two simultaneous invite creations serialize and leave exactly one active invite", async () => {
    const user = await createTestUser("Chef Concurrency Invite");
    const householdId = await getHouseholdId(user.id, prisma);
    createdHouseholdIds.push(householdId);

    // Execute two simultaneous invite creations through the production service
    const [res1, res2] = await Promise.all([
      createHouseholdInvite(user.id, prisma),
      createHouseholdInvite(user.id, prisma),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.code).not.toBe(res2.code);

    // Assert that exactly one active invite remains for this household in PostgreSQL
    const activeInvites = await prisma.inviteCode.findMany({
      where: {
        householdId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    expect(activeInvites).toHaveLength(1);
  });

  // 6. Expired invites are rejected by redeemHouseholdInvite
  it("Scenario 6: Expired invites are rejected by redeemHouseholdInvite", async () => {
    const host = await createTestUser("Chef Fiona");
    const joiner = await createTestUser("Joiner Frank");
    const householdId = await getHouseholdId(host.id, prisma);
    createdHouseholdIds.push(householdId);

    const code = generateInviteCode();
    await prisma.inviteCode.create({
      data: {
        code,
        householdId,
        createdBy: host.id,
        expiresAt: new Date(Date.now() - 1000), // expired in past
      },
    });

    await expect(redeemHouseholdInvite(joiner.id, code, prisma)).rejects.toThrow(HouseholdServiceError);
  });

  // 7. Invite max-uses limit is enforced (single-use)
  it("Scenario 7: Invite max-uses limit is enforced (single use)", async () => {
    const host = await createTestUser("Host George");
    const userA = await createTestUser("User Hannah");
    const userB = await createTestUser("User Ian");
    const householdId = await getHouseholdId(host.id, prisma);
    createdHouseholdIds.push(householdId);

    const invite = await createHouseholdInvite(host.id, prisma);

    // First redemption succeeds
    const resA = await redeemHouseholdInvite(userA.id, invite.code, prisma);
    expect(resA.success).toBe(true);

    // Second redemption fails
    await expect(redeemHouseholdInvite(userB.id, invite.code, prisma)).rejects.toThrow(HouseholdServiceError);
  });

  // 8. Member joining transfers to target household and preserves recipes deterministically
  it("Scenario 8: Personal household recipes are safely migrated on join with zero data loss", async () => {
    const host = await createTestUser("Host Jack");
    const guest = await createTestUser("Guest Jill");
    const hostHouseholdId = await getHouseholdId(host.id, prisma);
    const guestHouseholdId = await getHouseholdId(guest.id, prisma);
    createdHouseholdIds.push(hostHouseholdId, guestHouseholdId);

    // Host already has a recipe with slug 'pasta-carbonara'
    await prisma.recipe.create({
      data: {
        householdId: hostHouseholdId,
        title: "Host's Carbonara",
        slug: "pasta-carbonara",
        markdown: "# Host Carbonara",
        frontmatter: {},
      },
    });

    // Guest has a conflicting slug 'pasta-carbonara' and a unique slug 'jills-salad'
    const guestRecipe1 = await prisma.recipe.create({
      data: {
        householdId: guestHouseholdId,
        title: "Jill's Carbonara",
        slug: "pasta-carbonara",
        markdown: "# Jill Carbonara",
        frontmatter: {},
      },
    });

    const guestRecipe2 = await prisma.recipe.create({
      data: {
        householdId: guestHouseholdId,
        title: "Jill's Green Salad",
        slug: "jills-salad",
        markdown: "# Jill Salad",
        frontmatter: {},
      },
    });

    // Host generates invite
    const invite = await createHouseholdInvite(host.id, prisma);

    // Guest redeems invite
    const result = await redeemHouseholdInvite(guest.id, invite.code, prisma);
    expect(result.success).toBe(true);

    // Verify Guest is now in Host's household
    const refreshedGuest = await prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
    expect(refreshedGuest.householdId).toBe(hostHouseholdId);

    // Zero recipe loss: All recipes must exist in hostHouseholdId
    const recipesInTarget = await prisma.recipe.findMany({
      where: { householdId: hostHouseholdId },
    });

    expect(recipesInTarget).toHaveLength(3);

    // Non-conflicting recipe preserved exact slug
    const migratedSalad = recipesInTarget.find((r) => r.id === guestRecipe2.id);
    expect(migratedSalad).toBeDefined();
    expect(migratedSalad!.slug).toBe("jills-salad");

    // Conflicting recipe preserved with resolved collision slug (never overwritten or lost)
    const migratedCarbonara = recipesInTarget.find((r) => r.id === guestRecipe1.id);
    expect(migratedCarbonara).toBeDefined();
    expect(migratedCarbonara!.slug).not.toBe("pasta-carbonara");
    expect(migratedCarbonara!.slug.startsWith("pasta-carbonara-")).toBe(true);
  });

  // 9. Member departure creates a new personal household via leaveHousehold
  it("Scenario 9: Member departure creates a new personal household via leaveHousehold", async () => {
    const host = await createTestUser("Host Kevin");
    const member = await createTestUser("Member Laura");
    const sharedHouseholdId = await getHouseholdId(host.id, prisma);
    createdHouseholdIds.push(sharedHouseholdId);

    const invite = await createHouseholdInvite(host.id, prisma);
    await redeemHouseholdInvite(member.id, invite.code, prisma);

    // Member leaves via production service
    const leaveRes = await leaveHousehold(member.id, prisma);
    expect(leaveRes.success).toBe(true);
    expect(leaveRes.newHouseholdId).not.toBe(sharedHouseholdId);
    createdHouseholdIds.push(leaveRes.newHouseholdId);

    const refreshedMember = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(refreshedMember.householdId).toBe(leaveRes.newHouseholdId);
  });

  // 10. Household owner removes member via removeHouseholdMember
  it("Scenario 10: Household owner removes member via removeHouseholdMember", async () => {
    const host = await createTestUser("Host Mike");
    const member = await createTestUser("Member Nina");
    const householdId = await getHouseholdId(host.id, prisma);
    createdHouseholdIds.push(householdId);

    const invite = await createHouseholdInvite(host.id, prisma);
    await redeemHouseholdInvite(member.id, invite.code, prisma);

    const countBefore = await prisma.user.count({ where: { householdId } });
    expect(countBefore).toBe(2);

    // Host removes member via production service
    const removeRes = await removeHouseholdMember(host.id, member.id, prisma);
    expect(removeRes.success).toBe(true);
    expect(removeRes.removedMemberId).toBe(member.id);

    const countAfter = await prisma.user.count({ where: { householdId } });
    expect(countAfter).toBe(1);

    const refreshedMember = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(refreshedMember.householdId).not.toBe(householdId);
    if (refreshedMember.householdId) {
      createdHouseholdIds.push(refreshedMember.householdId);
    }
  });

  // 11. Multi-household data isolation with actual Jellyfin identities
  it("Scenario 11: Multi-household data isolation with actual Jellyfin identities", async () => {
    const userA = await createTestUser("Chef Paul", true);
    const userB = await createTestUser("Chef Quinn", true);
    const houseA = await getHouseholdId(userA.id, prisma);
    const houseB = await getHouseholdId(userB.id, prisma);
    createdHouseholdIds.push(houseA, houseB);

    // Create recipe in Household A
    const recipeA = await prisma.recipe.create({
      data: {
        householdId: houseA,
        title: "Paul's Secret Pasta",
        slug: "pauls-secret-pasta",
        markdown: "# Paul's Secret Pasta\nCook pasta.",
        frontmatter: {},
      },
    });

    // Query recipes for Household B
    const recipesForB = await prisma.recipe.findMany({
      where: { householdId: houseB },
    });

    expect(recipesForB.map((r) => r.id)).not.toContain(recipeA.id);
  });

  // 12. Concurrency: simultaneous join attempts on single-use invite allows exactly one winner
  it("Scenario 12: Simultaneous join attempts on single-use invite allows exactly one winner", async () => {
    const host = await createTestUser("Host Rachel");
    const joiner1 = await createTestUser("Joiner Sam");
    const joiner2 = await createTestUser("Joiner Tina");
    const householdId = await getHouseholdId(host.id, prisma);
    createdHouseholdIds.push(householdId);

    const invite = await createHouseholdInvite(host.id, prisma);

    const results = await Promise.allSettled([
      redeemHouseholdInvite(joiner1.id, invite.code, prisma),
      redeemHouseholdInvite(joiner2.id, invite.code, prisma),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const dbInvite = await prisma.inviteCode.findUniqueOrThrow({ where: { code: invite.code } });
    expect(dbInvite.usedAt).not.toBeNull();
  });
});
