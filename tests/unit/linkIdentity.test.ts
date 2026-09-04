import { describe, it, expect, vi } from "vitest";
import { linkPalateUserToJellyfin } from "@/lib/admin/linkIdentity";

describe("Jellyfin Identity Pre-Linking Unit Tests", () => {
  it("fails immediately if jellyfinServerId is missing or empty", async () => {
    const mockPrisma: any = {
      $transaction: vi.fn(),
    };

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "palate-user-123",
          jellyfinServerId: "",
          jellyfinUserId: "jf-user-456",
          jellyfinUsername: "alice",
        },
        mockPrisma
      )
    ).rejects.toThrow("Missing required parameters for account linking.");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails immediately if palateUserId is missing or empty", async () => {
    const mockPrisma: any = {
      $transaction: vi.fn(),
    };

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "",
          jellyfinServerId: "jf-server-abc",
          jellyfinUserId: "jf-user-456",
          jellyfinUsername: "alice",
        },
        mockPrisma
      )
    ).rejects.toThrow("Missing required parameters for account linking.");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails when target Palate user does not exist", async () => {
    const mockPrisma: any = {
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      }),
    };

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "non-existent-user",
          jellyfinServerId: "jf-server-abc",
          jellyfinUserId: "jf-user-456",
          jellyfinUsername: "alice",
        },
        mockPrisma
      )
    ).rejects.toThrow("Palate user not found for ID: non-existent-user");
  });

  it("fails when target user already has a different Jellyfin identity", async () => {
    const mockPrisma: any = {
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "palate-user-123",
              jellyfinIdentity: {
                jellyfinServerId: "existing-server",
                jellyfinUserId: "existing-user",
              },
            }),
          },
          jellyfinIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      }),
    };

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "palate-user-123",
          jellyfinServerId: "new-server",
          jellyfinUserId: "new-user",
          jellyfinUsername: "alice",
        },
        mockPrisma
      )
    ).rejects.toThrow(/already has an associated Jellyfin identity/);
  });

  it("fails when the Jellyfin identity is already linked to another Palate user", async () => {
    const mockPrisma: any = {
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "palate-user-123",
              jellyfinIdentity: null,
            }),
          },
          jellyfinIdentity: {
            findUnique: vi.fn().mockResolvedValue({
              id: "link-999",
              userId: "other-palate-user-456",
              jellyfinServerId: "server-1",
              jellyfinUserId: "jf-user-1",
            }),
          },
        };
        return cb(tx);
      }),
    };

    await expect(
      linkPalateUserToJellyfin(
        {
          palateUserId: "palate-user-123",
          jellyfinServerId: "server-1",
          jellyfinUserId: "jf-user-1",
          jellyfinUsername: "alice",
        },
        mockPrisma
      )
    ).rejects.toThrow(/is already linked to another Palate user/);
  });

  it("succeeds and binds identity when all parameters and target user are valid", async () => {
    const createMock = vi.fn().mockResolvedValue({});
    const updateUserMock = vi.fn().mockResolvedValue({});

    const mockPrisma: any = {
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "palate-user-123",
              jellyfinIdentity: null,
            }),
            update: updateUserMock,
          },
          jellyfinIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createMock,
          },
        };
        return cb(tx);
      }),
    };

    const result = await linkPalateUserToJellyfin(
      {
        palateUserId: "palate-user-123",
        jellyfinServerId: "server-1",
        jellyfinUserId: "jf-user-1",
        jellyfinUsername: "alice",
      },
      mockPrisma
    );

    expect(result.success).toBe(true);
    expect(result.userId).toBe("palate-user-123");
    expect(result.alreadyLinked).toBe(false);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "palate-user-123",
          jellyfinServerId: "server-1",
          jellyfinUserId: "jf-user-1",
          jellyfinUsername: "alice",
        }),
      })
    );
  });
});
