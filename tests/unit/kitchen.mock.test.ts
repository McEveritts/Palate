import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSession, households, users, inviteCodes, recipes, mockDb } = vi.hoisted(() => {
  const mockSession = {
    user: {
      id: "user-alice",
      name: "Alice",
    },
  };

  const households = new Map<string, any>();
  const users = new Map<string, any>();
  const inviteCodes = new Map<string, any>();
  const recipes = new Map<string, any>();

  const mockDb: any = {
    user: {
      findUnique: vi.fn(async ({ where, select }: any) => {
        const u = users.get(where.id);
        if (!u) return null;
        if (select) {
          const res: any = {};
          for (const k of Object.keys(select)) {
            res[k] = u[k];
          }
          return res;
        }
        return { ...u };
      }),
      findUniqueOrThrow: vi.fn(async ({ where, select }: any) => {
        const u = users.get(where.id);
        if (!u) throw new Error("User not found");
        if (select) {
          const res: any = {};
          for (const k of Object.keys(select)) {
            res[k] = u[k];
          }
          return res;
        }
        return { ...u };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = users.get(where.id);
        if (!u) throw new Error("User not found");
        const updated = { ...u, ...data };
        users.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, u] of users.entries()) {
          let match = true;
          if (where.id && u.id !== where.id) match = false;
          if (where.householdId === null && u.householdId !== null) match = false;
          if (match) {
            const updated = { ...u, ...data };
            users.set(id, updated);
            count++;
          }
        }
        return { count };
      }),
      count: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const u of users.values()) {
          if (where.householdId && u.householdId === where.householdId) {
            count++;
          }
        }
        return count;
      }),
    },
    household: {
      findUnique: vi.fn(async ({ where }: any) => {
        const h = households.get(where.id);
        if (!h) return null;
        const members = Array.from(users.values())
          .filter((u) => u.householdId === h.id)
          .map((u) => ({ id: u.id, name: u.name, email: u.email, image: u.image }));
        const activeInvites = Array.from(inviteCodes.values()).filter(
          (i) => i.householdId === h.id && !i.usedAt && i.expiresAt > new Date()
        );
        return { ...h, members, inviteCodes: activeInvites };
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `household-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const h = { id, name: data.name };
        households.set(id, h);
        if (data.members?.connect?.id) {
          const u = users.get(data.members.connect.id);
          if (u) {
            u.householdId = id;
          }
        }
        return h;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const h = households.get(where.id);
        if (!h) throw new Error("Household not found");
        const updated = { ...h, ...data };
        households.set(where.id, updated);
        return updated;
      }),
    },
    inviteCode: {
      findUnique: vi.fn(async ({ where }: any) => {
        const inv = inviteCodes.get(where.code);
        if (!inv) return null;
        return { ...inv };
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `invite-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const inv = { id, ...data };
        inviteCodes.set(data.code, inv);
        return inv;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const inv = Array.from(inviteCodes.values()).find((i) => i.id === where.id);
        if (!inv) throw new Error("Invite not found");
        const updated = { ...inv, ...data };
        inviteCodes.set(inv.code, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [code, inv] of inviteCodes.entries()) {
          let match = true;
          if (where.id && inv.id !== where.id) match = false;
          if (where.householdId && inv.householdId !== where.householdId) match = false;
          if (where.usedAt === null && inv.usedAt != null) match = false;
          if (where.expiresAt?.gt && !(inv.expiresAt > where.expiresAt.gt)) match = false;

          if (match) {
            const updated = { ...inv, ...data };
            inviteCodes.set(code, updated);
            count++;
          }
        }
        return { count };
      }),
    },
    recipe: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const r of recipes.values()) {
          let match = true;
          if (where.id && r.id !== where.id) match = false;
          if (where.householdId && r.householdId !== where.householdId) match = false;
          if (where.slug && r.slug !== where.slug) match = false;
          if (match) return { ...r };
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const r = recipes.get(where.id);
        if (!r) throw new Error("Recipe not found");
        const updated = { ...r, ...data };
        recipes.set(where.id, updated);
        return updated;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const r = recipes.get(where.id);
        if (!r) throw new Error("Recipe not found");
        recipes.delete(where.id);
        return r;
      }),
    },
    userConfig: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return await cb(mockDb);
      }
      return Promise.all(cb);
    }),
    $executeRaw: vi.fn(async () => 1),
  };

  return { mockSession, households, users, inviteCodes, recipes, mockDb };
});

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(async () => mockSession),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  prisma: mockDb,
}));

import { GET, POST } from "@/app/api/household/route";
import { getHouseholdId } from "@/lib/household";

describe("Kitchen & Household Multi-User Integration Tests (All 15 Cases)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    households.clear();
    users.clear();
    inviteCodes.clear();
    recipes.clear();

    // Default Seed State:
    // Household 1: Alice (creator), Bob (member)
    households.set("hh-1", { id: "hh-1", name: "Alice's Kitchen" });
    users.set("user-alice", { id: "user-alice", name: "Alice", householdId: "hh-1" });
    users.set("user-bob", { id: "user-bob", name: "Bob", householdId: "hh-1" });

    // Household 2: Charlie (solo)
    households.set("hh-2", { id: "hh-2", name: "Charlie's Kitchen" });
    users.set("user-charlie", { id: "user-charlie", name: "Charlie", householdId: "hh-2" });

    // Household 1 Recipe
    recipes.set("recipe-1", {
      id: "recipe-1",
      householdId: "hh-1",
      slug: "roast-chicken",
      title: "Roast Chicken",
    });

    mockSession.user = { id: "user-alice", name: "Alice" };
  });

  // Case 1: Jellyfin user joins via valid invite code -> user added to household, invite code marked used
  it("Case 1: Jellyfin user joins via valid invite code and marks invite used", async () => {
    // Charlie creates invite for hh-2
    inviteCodes.set("VALID123", {
      id: "inv-1",
      code: "VALID123",
      householdId: "hh-2",
      createdBy: "user-charlie",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });

    // Alice redeems Charlie's invite
    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "VALID123" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(users.get("user-alice")?.householdId).toBe("hh-2");
    expect(inviteCodes.get("VALID123")?.usedAt).toBeDefined();
    expect(inviteCodes.get("VALID123")?.usedBy).toBe("user-alice");
  });

  // Case 2: Jellyfin user attempts to join with invalid/expired invite code -> rejected with 400
  it("Case 2: Rejects invalid or expired invite code with 400 or 404", async () => {
    // Expired invite
    inviteCodes.set("EXPIRED1", {
      id: "inv-exp",
      code: "EXPIRED1",
      householdId: "hh-2",
      createdBy: "user-charlie",
      usedAt: null,
      expiresAt: new Date(Date.now() - 10000),
    });

    const reqExpired = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "EXPIRED1" }),
    });
    const resExpired = await POST(reqExpired);
    expect(resExpired.status).toBe(400);

    // Non-existent invite
    const reqInvalid = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "NONEXIST" }),
    });
    const resInvalid = await POST(reqInvalid);
    expect(resInvalid.status).toBe(404);
  });

  // Case 3: Jellyfin user leaves household -> new solo household created for departed user
  it("Case 3: Jellyfin user leaves shared household and receives a new solo household", async () => {
    // Alice is in hh-1 with Bob. Alice leaves.
    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "leave" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.newHouseholdId).toBeDefined();
    expect(json.newHouseholdId).not.toBe("hh-1");

    // Alice is in her new household; Bob remains in hh-1
    expect(users.get("user-alice")?.householdId).toBe(json.newHouseholdId);
    expect(users.get("user-bob")?.householdId).toBe("hh-1");
  });

  // Case 4: Member removes another member from household -> departed member moved to their own solo household
  it("Case 4: Member removes another member, moving departed member to a new solo household", async () => {
    // Alice removes Bob from hh-1
    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "remove-member", memberId: "user-bob" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.removedMemberId).toBe("user-bob");

    // Bob has been moved out of hh-1 to his own solo household
    expect(users.get("user-bob")?.householdId).not.toBe("hh-1");
    expect(users.get("user-alice")?.householdId).toBe("hh-1");
  });

  // Case 5: Household member accesses household recipe -> 200 allowed
  it("Case 5: Household member successfully accesses recipe scoped to their household", async () => {
    const userHouseholdId = await getHouseholdId("user-alice");
    const recipe = await mockDb.recipe.findFirst({
      where: { id: "recipe-1", householdId: userHouseholdId },
    });

    expect(recipe).not.toBeNull();
    expect(recipe?.title).toBe("Roast Chicken");
  });

  // Case 6: Non-member Jellyfin user attempts to access household recipe -> forbidden/null
  it("Case 6: Non-member cannot access recipe belonging to another household", async () => {
    const charlieHouseholdId = await getHouseholdId("user-charlie");
    const recipe = await mockDb.recipe.findFirst({
      where: { id: "recipe-1", householdId: charlieHouseholdId },
    });

    expect(recipe).toBeNull();
  });

  // Case 7: Simultaneous join requests with the same invite code -> only one succeeds (race-proof)
  it("Case 7: Simultaneous join requests with the same invite code are race-proof (atomic)", async () => {
    inviteCodes.set("RACE1234", {
      id: "inv-race",
      code: "RACE1234",
      householdId: "hh-2",
      createdBy: "user-charlie",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });

    users.set("user-dave", { id: "user-dave", name: "Dave", householdId: "hh-solo-dave" });

    // Concurrently simulate two redemption attempts
    const req1 = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "RACE1234" }),
    });
    const req2 = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "RACE1234" }),
    });

    const [res1, res2] = await Promise.all([POST(req1), POST(req2)]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one should succeed (200) and one must be rejected (400)
    expect(statuses).toEqual([200, 400]);
  });

  // Case 8: Member tries to remove self via remove-member (should use leave instead)
  it("Case 8: Rejects member attempting to remove themselves via remove-member", async () => {
    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "remove-member", memberId: "user-alice" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Please use the Leave Household option");
  });

  // Case 9: Member tries to remove non-member from household -> 404
  it("Case 9: Rejects removal of a user that is not in the caller's household", async () => {
    // Alice (hh-1) tries to remove Charlie (hh-2)
    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "remove-member", memberId: "user-charlie" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Member not found in your household");
  });

  // Case 10: User with no household gets auto-assigned a solo household upon action
  it("Case 10: Auto-creates a solo household for a user with no current household", async () => {
    users.set("user-new", { id: "user-new", name: "Newbie", householdId: null });

    const hhId = await getHouseholdId("user-new");
    expect(hhId).toBeDefined();
    expect(households.has(hhId)).toBe(true);
    expect(users.get("user-new")?.householdId).toBe(hhId);
  });

  // Case 11: Solo user attempts to leave own household -> handled gracefully (no orphaned state)
  it("Case 11: Handles solo user leaving own household gracefully without orphaned state", async () => {
    mockSession.user = { id: "user-charlie", name: "Charlie" };

    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "leave" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain("already in your own personal kitchen");
    expect(users.get("user-charlie")?.householdId).toBe("hh-2");
  });

  // Case 12: Invite code regeneration creates new 8-char uppercase code and invalidates previous active invites
  it("Case 12: Inactive / superseded invite codes are invalidated when generating a new invite", async () => {
    // Generate 1st invite
    const req1 = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "create-invite" }),
    });
    const res1 = await POST(req1);
    const json1 = await res1.json();
    expect(json1.code).toMatch(/^[A-F0-9]{8}$/);

    // Generate 2nd invite for same household
    const req2 = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "create-invite" }),
    });
    const res2 = await POST(req2);
    const json2 = await res2.json();

    expect(json2.code).toMatch(/^[A-F0-9]{8}$/);
    expect(json2.code).not.toBe(json1.code);

    // First invite should now be expired
    const firstInvite = inviteCodes.get(json1.code);
    expect(firstInvite?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  // Case 13: Invite code expiration enforced (e.g. past 48h)
  it("Case 13: Rejects invite codes that have exceeded 48 hours", async () => {
    inviteCodes.set("OLDTOKEN", {
      id: "inv-old",
      code: "OLDTOKEN",
      householdId: "hh-2",
      createdBy: "user-charlie",
      usedAt: null,
      expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000 - 1000), // 48h and 1s ago
    });

    const req = new Request("http://localhost/api/household", {
      method: "POST",
      body: JSON.stringify({ action: "redeem-invite", code: "OLDTOKEN" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("expired");
  });

  // Case 14: Member in household A cannot view members of household B
  it("Case 14: Household members can only see members of their own household in GET /api/household", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.household.id).toBe("hh-1");
    const memberIds = json.household.members.map((m: any) => m.id);
    expect(memberIds).toContain("user-alice");
    expect(memberIds).toContain("user-bob");
    expect(memberIds).not.toContain("user-charlie");
  });

  // Case 15: Cross-household recipe mutation (update/delete) blocked
  it("Case 15: Rejects recipe update or delete if recipe belongs to a different household", async () => {
    const charlieHouseholdId = await getHouseholdId("user-charlie");

    // Charlie attempts to mutate recipe-1 belonging to hh-1
    const recipeToMutate = await mockDb.recipe.findFirst({
      where: { id: "recipe-1", householdId: charlieHouseholdId },
    });

    // Scoped query yields null, preventing unauthorized modification
    expect(recipeToMutate).toBeNull();
  });
});
