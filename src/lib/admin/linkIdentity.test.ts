import { describe, it, expect, vi, beforeEach } from "vitest";
import { linkPalateUserToJellyfin, countGoogleUsers } from "./linkIdentity";

describe("Administrative Account Link Identity", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      $transaction: vi.fn(async (cb) => cb(mockDb)),
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      jellyfinIdentity: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      account: {
        findMany: vi.fn(),
      },
    };
  });

  it("successfully links an unlinked user to a new Jellyfin identity", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Google Name",
      jellyfinIdentity: null,
    });
    mockDb.jellyfinIdentity.findUnique.mockResolvedValue(null);
    mockDb.jellyfinIdentity.create.mockResolvedValue({ id: "ident-1" });
    mockDb.user.update.mockResolvedValue({ id: "user-1", name: "new_jellyfin_user" });

    const result = await linkPalateUserToJellyfin(
      {
        palateUserId: "user-1",
        jellyfinServerId: "server-1",
        jellyfinUserId: "jf-user-1",
        jellyfinUsername: "new_jellyfin_user",
      },
      mockDb
    );

    expect(result.success).toBe(true);
    expect(result.alreadyLinked).toBe(false);
    expect(mockDb.jellyfinIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        jellyfinServerId: "server-1",
        jellyfinUserId: "jf-user-1",
        jellyfinUsername: "new_jellyfin_user",
      }),
    });
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "new_jellyfin_user" },
    });
  });

  it("is idempotent when the account is already linked to the same Jellyfin identity", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "jf_user",
      jellyfinIdentity: { id: "ident-1" },
    });
    mockDb.jellyfinIdentity.findUnique.mockResolvedValue({
      id: "ident-1",
      userId: "user-1",
      jellyfinUsername: "jf_user",
    });

    const result = await linkPalateUserToJellyfin(
      {
        palateUserId: "user-1",
        jellyfinServerId: "server-1",
        jellyfinUserId: "jf-user-1",
        jellyfinUsername: "jf_user",
      },
      mockDb
    );

    expect(result.success).toBe(true);
    expect(result.alreadyLinked).toBe(true);
    expect(mockDb.jellyfinIdentity.create).not.toHaveBeenCalled();
  });

  it("rejects linking if the Jellyfin identity is already associated with a different user", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-2",
      name: "Google User 2",
      jellyfinIdentity: null,
    });
    mockDb.jellyfinIdentity.findUnique.mockResolvedValue({
      id: "ident-1",
      userId: "user-1", // different user
      jellyfinUsername: "jf_user",
    });

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "user-2",
          jellyfinServerId: "server-1",
          jellyfinUserId: "jf-user-1",
          jellyfinUsername: "jf_user",
        },
        mockDb
      )
    ).rejects.toThrow("already linked to another Palate user");
  });

  it("rejects linking if the Palate user already has a different Jellyfin identity", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "User 1",
      jellyfinIdentity: {
        jellyfinServerId: "server-old",
        jellyfinUserId: "jf-old",
      },
    });
    mockDb.jellyfinIdentity.findUnique.mockResolvedValue(null);

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "user-1",
          jellyfinServerId: "server-new",
          jellyfinUserId: "jf-new",
          jellyfinUsername: "jf_user_new",
        },
        mockDb
      )
    ).rejects.toThrow("already has an associated Jellyfin identity");
  });

  it("correctly counts Google-only users without exposing PII", async () => {
    mockDb.account.findMany.mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-3" },
    ]);
    mockDb.jellyfinIdentity.count.mockResolvedValue(1);

    const counts = await countGoogleUsers(mockDb);
    expect(counts.totalGoogleAccounts).toBe(3);
    expect(counts.unlinkedGoogleUsers).toBe(2);
  });
});
