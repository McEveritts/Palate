import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  inspectGoogleTokenMigration,
  migrateGoogleTokens,
} from "./migrateGoogleTokens";
import { encryptToken, isTokenEncrypted } from "../tokenEncryption";

describe("Google Token Migration Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PALATE_ENCRYPTION_SECRET = "test-token-secret-32-chars-minimum";
  });

  it("inspects Google accounts and returns accurate plaintext vs encrypted counts", async () => {
    const mockDb = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "acc-1",
            access_token: "plaintext-token-1",
            refresh_token: "plaintext-refresh-1",
          },
          {
            id: "acc-2",
            access_token: encryptToken("secret-access-2"),
            refresh_token: encryptToken("secret-refresh-2"),
          },
          {
            id: "acc-3",
            access_token: encryptToken("secret-access-3"),
            refresh_token: "plaintext-refresh-3", // partially unencrypted
          },
        ]),
      },
    } as any;

    const result = await inspectGoogleTokenMigration(mockDb);
    expect(result.totalGoogleAccounts).toBe(3);
    expect(result.alreadyEncrypted).toBe(1);
    expect(result.needsEncryption).toBe(2);
  });

  it("performs dry run without modifying database", async () => {
    const mockDb = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "acc-1",
            access_token: "plaintext-token",
            refresh_token: "plaintext-refresh",
          },
        ]),
        updateMany: vi.fn(),
      },
    } as any;

    const result = await migrateGoogleTokens({ dryRun: true }, mockDb);
    expect(result.totalAccounts).toBe(1);
    expect(result.newlyEncrypted).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(mockDb.account.updateMany).not.toHaveBeenCalled();
  });

  it("refuses live migration without confirmed: true flag", async () => {
    const mockDb = { account: { findMany: vi.fn() } } as any;
    await expect(migrateGoogleTokens({ dryRun: false }, mockDb)).rejects.toThrow(
      "Refusing to execute live token encryption without explicit confirmed: true flag."
    );
  });

  it("executes live migration using atomic compare-and-swap", async () => {
    const rawAccess = "ya29.sample-access-token";
    const rawRefresh = "1//04sample-refresh-token";

    const mockDb = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "acc-1",
            access_token: rawAccess,
            refresh_token: rawRefresh,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;

    const result = await migrateGoogleTokens({ dryRun: false, confirmed: true }, mockDb);
    expect(result.totalAccounts).toBe(1);
    expect(result.newlyEncrypted).toBe(1);
    expect(result.casSkipped).toBe(0);

    // Verify CAS predicate passed to updateMany
    expect(mockDb.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: "acc-1",
        access_token: rawAccess,
        refresh_token: rawRefresh,
      },
      data: {
        access_token: expect.stringMatching(/^enc:v1:/),
        refresh_token: expect.stringMatching(/^enc:v1:/),
      },
    });

    const updateCall = mockDb.account.updateMany.mock.calls[0][0];
    expect(isTokenEncrypted(updateCall.data.access_token)).toBe(true);
    expect(isTokenEncrypted(updateCall.data.refresh_token)).toBe(true);
  });

  it("handles concurrent modification by recording casSkipped when count is 0", async () => {
    const mockDb = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "acc-1",
            access_token: "raw-token",
            refresh_token: "raw-refresh",
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }), // CAS failed
      },
    } as any;

    const result = await migrateGoogleTokens({ dryRun: false, confirmed: true }, mockDb);
    expect(result.newlyEncrypted).toBe(0);
    expect(result.casSkipped).toBe(1);
  });
});
