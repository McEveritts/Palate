import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    jellyfinIdentity: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === "function") {
        return arg(mockPrisma);
      }
      return arg;
    }),
  };
  return { prisma: mockPrisma };
});

vi.mock("@/lib/jellyfin", () => ({
  isJellyfinEnabled: vi.fn().mockReturnValue(true),
  authenticateWithJellyfin: vi.fn(),
}));

vi.mock("@/lib/provisioning", () => ({
  ensureUserProvisioned: vi.fn().mockResolvedValue(undefined),
}));

import { authorizeJellyfin, checkAuthRateLimit, authLimiter } from "./auth";
import { prisma } from "@/lib/db";
import { authenticateWithJellyfin } from "@/lib/jellyfin";
import { ensureUserProvisioned } from "@/lib/provisioning";

describe("Jellyfin NextAuth Provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    authLimiter.instance = null;
    process.env = { ...originalEnv, NEXTAUTH_SECRET: "test-secret-12345" };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    authLimiter.instance = null;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("checkAuthRateLimit", () => {
    it("fails secure in production if NEXTAUTH_SECRET is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXTAUTH_SECRET;

      const allowed = await checkAuthRateLimit("192.168.1.1", "testuser");
      expect(allowed).toBe(false);
    });

    it("returns false when Upstash rate limiter returns { success: false }", async () => {
      const mockLimit = vi.fn().mockResolvedValue({ success: false });
      authLimiter.instance = {
        limit: mockLimit,
      } as any;

      const allowed = await checkAuthRateLimit("192.168.1.1", "bruteforce_user");
      expect(allowed).toBe(false);
      expect(mockLimit).toHaveBeenCalledWith(
        expect.stringMatching(/^auth_rl_192\.168\.1\.1_[a-f0-9]{64}$/)
      );
    });

    it("returns true when Upstash rate limiter returns { success: true }", async () => {
      authLimiter.instance = {
        limit: vi.fn().mockResolvedValue({ success: true }),
      } as any;

      const allowed = await checkAuthRateLimit("192.168.1.1", "normal_user");
      expect(allowed).toBe(true);
    });
  });

  describe("authorizeJellyfin", () => {
    it("throws RateLimited when Upstash limiter rejects the request with { success: false }", async () => {
      authLimiter.instance = {
        limit: vi.fn().mockResolvedValue({ success: false }),
      } as any;

      await expect(
        authorizeJellyfin(
          { username: "spam_chef", password: "pwd" },
          { headers: { "x-forwarded-for": "10.0.0.1" } }
        )
      ).rejects.toThrow("RateLimited");
    });

    it("returns null when credentials are missing or invalid", async () => {
      const result = await authorizeJellyfin(undefined as any, {} as any);
      expect(result).toBeNull();

      const result2 = await authorizeJellyfin({ username: "", password: "" }, {} as any);
      expect(result2).toBeNull();
    });

    it("throws AccountDisabled when Jellyfin user is disabled", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: false,
        error: "AccountDisabled",
      });

      await expect(
        authorizeJellyfin(
          { username: "banned_chef", password: "pwd" },
          { headers: { "x-forwarded-for": "10.0.0.1" } }
        )
      ).rejects.toThrow("AccountDisabled");
    });

    it("throws JellyfinUnavailable when Jellyfin server is unreachable", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: false,
        error: "JellyfinUnavailable",
      });

      await expect(
        authorizeJellyfin(
          { username: "chef", password: "pwd" },
          { headers: { "x-forwarded-for": "10.0.0.1" } }
        )
      ).rejects.toThrow("JellyfinUnavailable");
    });

    it("returns null on InvalidCredentials (standard NextAuth CredentialsSignin)", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: false,
        error: "InvalidCredentials",
      });

      const result = await authorizeJellyfin(
        { username: "chef", password: "wrong_pwd" },
        { headers: { "x-forwarded-for": "10.0.0.1" } }
      );
      expect(result).toBeNull();
    });

    it("creates new user + JellyfinIdentity on first login and provisions account", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: true,
        data: {
          jellyfinUserId: "jf-user-100",
          jellyfinServerId: "jf-srv-1",
          jellyfinUsername: "Auguste Escoffier",
        },
      });

      vi.mocked(prisma.jellyfinIdentity.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce({
        id: "palate-user-100",
        name: "Auguste Escoffier",
        email: null,
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "palate-user-100",
        name: "Auguste Escoffier",
        email: null,
      } as any);

      const result = await authorizeJellyfin(
        { username: "escoffier", password: "pwd" },
        { headers: { "x-forwarded-for": "10.0.0.1" } }
      );

      expect(result).toEqual({
        id: "palate-user-100",
        name: "Auguste Escoffier",
        email: null,
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: "Auguste Escoffier",
          jellyfinIdentity: {
            create: {
              jellyfinUserId: "jf-user-100",
              jellyfinServerId: "jf-srv-1",
              jellyfinUsername: "Auguste Escoffier",
              lastAuthenticatedAt: expect.any(Date),
            },
          },
        },
      });

      expect(ensureUserProvisioned).toHaveBeenCalledWith("palate-user-100", "Auguste Escoffier");
    });

    it("updates dual names and lastAuthenticatedAt when existing user logs in with new display name", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: true,
        data: {
          jellyfinUserId: "jf-user-100",
          jellyfinServerId: "jf-srv-1",
          jellyfinUsername: "Master Chef Auguste",
        },
      });

      const existingIdentity = {
        id: "ident-100",
        userId: "palate-user-100",
        jellyfinUserId: "jf-user-100",
        jellyfinServerId: "jf-srv-1",
        jellyfinUsername: "Old Escoffier",
        user: { id: "palate-user-100", name: "Old Escoffier", email: null },
      };

      vi.mocked(prisma.jellyfinIdentity.findUnique).mockResolvedValueOnce(existingIdentity as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "palate-user-100",
        name: "Master Chef Auguste",
        email: null,
      } as any);

      const result = await authorizeJellyfin(
        { username: "escoffier", password: "pwd" },
        { headers: { "x-forwarded-for": "10.0.0.1" } }
      );

      expect(result).toEqual({
        id: "palate-user-100",
        name: "Master Chef Auguste",
        email: null,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(ensureUserProvisioned).toHaveBeenCalledWith("palate-user-100", "Master Chef Auguste");
    });

    it("recovers gracefully from concurrent first-login P2002 conflict by loading winning identity", async () => {
      vi.mocked(authenticateWithJellyfin).mockResolvedValueOnce({
        success: true,
        data: {
          jellyfinUserId: "jf-user-concurrent",
          jellyfinServerId: "jf-srv-1",
          jellyfinUsername: "Concurrent Chef",
        },
      });

      vi.mocked(prisma.jellyfinIdentity.findUnique)
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce({     // winning record lookup in catch block
          id: "ident-winner",
          userId: "palate-winner-user",
          jellyfinUserId: "jf-user-concurrent",
          jellyfinServerId: "jf-srv-1",
          jellyfinUsername: "Concurrent Chef",
          user: { id: "palate-winner-user", name: "Concurrent Chef", email: null },
        } as any);

      const p2002Error = new Error("Unique constraint failed");
      (p2002Error as any).code = "P2002";
      vi.mocked(prisma.user.create).mockRejectedValueOnce(p2002Error);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "palate-winner-user",
        name: "Concurrent Chef",
        email: null,
      } as any);

      const result = await authorizeJellyfin(
        { username: "concurrent_chef", password: "pwd" },
        { headers: { "x-forwarded-for": "10.0.0.1" } }
      );

      expect(result).toEqual({
        id: "palate-winner-user",
        name: "Concurrent Chef",
        email: null,
      });

      expect(ensureUserProvisioned).toHaveBeenCalledWith("palate-winner-user", "Concurrent Chef");
    });
  });
});
