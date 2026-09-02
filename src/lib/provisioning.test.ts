import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    userConfig: {
      upsert: vi.fn(),
    },
    user: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    household: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => {
      return cb(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

import { ensureUserProvisioned } from "./provisioning";
import { prisma } from "@/lib/db";

describe("Idempotent & Concurrency-Safe User Provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if userId is empty", async () => {
    await expect(ensureUserProvisioned("")).rejects.toThrow("Cannot provision user without a valid userId");
  });

  it("provisions UserConfig and Household atomically within transaction", async () => {
    vi.mocked(prisma.userConfig.upsert).mockResolvedValue({ id: "cfg-1", userId: "u1" } as any);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ householdId: null, name: "Chef Ramsay" } as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "hh-1", name: "Chef Ramsay's Kitchen" } as any);

    await ensureUserProvisioned("u1", "Chef Ramsay");

    expect(prisma.userConfig.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", metricSystem: false },
      update: {},
    });

    expect(prisma.household.create).toHaveBeenCalledWith({
      data: { name: "Chef Ramsay's Kitchen" },
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", householdId: null },
      data: { householdId: "hh-1" },
    });

    expect(prisma.household.delete).not.toHaveBeenCalled();
  });

  it("cleans up redundant household if a concurrent request set householdId first", async () => {
    vi.mocked(prisma.userConfig.upsert).mockResolvedValue({ id: "cfg-1", userId: "u1" } as any);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ householdId: null, name: "Alice" } as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.household.create).mockResolvedValue({ id: "hh-redundant", name: "Alice's Kitchen" } as any);
    vi.mocked(prisma.household.delete).mockResolvedValue({ id: "hh-redundant" } as any);

    await ensureUserProvisioned("u1", "Alice");

    expect(prisma.household.delete).toHaveBeenCalledWith({
      where: { id: "hh-redundant" },
    });
  });

  it("propagates database errors instead of swallowing them", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB connection failure"));

    await expect(ensureUserProvisioned("u1", "Alice")).rejects.toThrow("DB connection failure");
  });
});
