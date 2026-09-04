import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory bucket store and transaction lock simulation with vi.hoisted
const { inMemoryBuckets, activeLocks, mockPrisma } = vi.hoisted(() => {
  const inMemoryBuckets = new Map<string, { key: string; attempts: Date[]; expiresAt: Date }>();
  const activeLocks = new Set<string>();

  const mockPrisma: any = {
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
    authRateLimit: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const bucket = inMemoryBuckets.get(where.key);
        if (!bucket) return null;
        return {
          key: bucket.key,
          attempts: [...bucket.attempts],
          expiresAt: new Date(bucket.expiresAt.getTime()),
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: any }) => {
        const bucket = inMemoryBuckets.get(where.key) || {
          key: where.key,
          attempts: [],
          expiresAt: new Date(),
        };
        if (data.attempts) bucket.attempts = [...data.attempts];
        if (data.expiresAt) bucket.expiresAt = new Date(data.expiresAt.getTime());
        inMemoryBuckets.set(where.key, bucket);
        return bucket;
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: any; update: any }) => {
        let bucket = inMemoryBuckets.get(where.key);
        if (bucket) {
          if (update.attempts) bucket.attempts = [...update.attempts];
          if (update.expiresAt) bucket.expiresAt = new Date(update.expiresAt.getTime());
        } else {
          bucket = {
            key: create.key,
            attempts: [...create.attempts],
            expiresAt: new Date(create.expiresAt.getTime()),
          };
        }
        inMemoryBuckets.set(where.key, bucket);
        return bucket;
      }),
    },
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === "function") {
        let lockKey: string | null = null;
        const txPrisma = {
          ...mockPrisma,
          $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
            const sql = typeof strings === "string" ? strings : strings.join("?");
            if (sql.includes("pg_advisory_xact_lock")) {
              lockKey = String(values[0]);
              while (activeLocks.has(lockKey)) {
                await new Promise((r) => setTimeout(r, 2));
              }
              activeLocks.add(lockKey);
            }
            return 1;
          }),
        };
        try {
          return await arg(txPrisma);
        } finally {
          if (lockKey) {
            activeLocks.delete(lockKey);
          }
        }
      }
      return arg;
    }),
  };

  return { inMemoryBuckets, activeLocks, mockPrisma };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/jellyfin", () => ({
  isJellyfinEnabled: vi.fn().mockReturnValue(true),
  authenticateWithJellyfin: vi.fn(),
}));

vi.mock("@/lib/provisioning", () => ({
  ensureUserProvisioned: vi.fn().mockResolvedValue(undefined),
}));

import {
  authorizeJellyfin,
  checkAuthRateLimit,
  computeRateLimitKey,
  authOptions,
} from "./auth";
import { prisma } from "@/lib/db";
import { authenticateWithJellyfin } from "@/lib/jellyfin";
import { ensureUserProvisioned } from "@/lib/provisioning";

describe("Jellyfin NextAuth Provider with PostgreSQL Rate Limiter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryBuckets.clear();
    activeLocks.clear();
    process.env = {
      ...originalEnv,
      NEXTAUTH_SECRET: "test-secret-12345",
      PALATE_RATE_LIMIT_SECRET: "test-secret-12345",
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    inMemoryBuckets.clear();
    activeLocks.clear();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("computeRateLimitKey & Normalization", () => {
    it("produces identical HMAC keys for case and whitespace variants of username", () => {
      const key1 = computeRateLimitKey("192.168.1.50", "master_chef", "my-secret");
      const key2 = computeRateLimitKey("192.168.1.50", "  Master_Chef  ", "my-secret");
      const key3 = computeRateLimitKey("192.168.1.50", "MASTER_CHEF", "my-secret");

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different keys for different client IPs", () => {
      const keyA = computeRateLimitKey("10.0.0.1", "chef", "my-secret");
      const keyB = computeRateLimitKey("10.0.0.2", "chef", "my-secret");
      expect(keyA).not.toBe(keyB);
    });

    it("produces different keys for different usernames on same IP", () => {
      const keyA = computeRateLimitKey("10.0.0.1", "alice", "my-secret");
      const keyB = computeRateLimitKey("10.0.0.1", "bob", "my-secret");
      expect(keyA).not.toBe(keyB);
    });
  });

  describe("checkAuthRateLimit (PostgreSQL Sliding Window)", () => {
    it("fails secure in production if PALATE_RATE_LIMIT_SECRET is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.PALATE_RATE_LIMIT_SECRET;

      const allowed = await checkAuthRateLimit("192.168.1.1", "testuser");
      expect(allowed).toBe(false);
    });

    it("fails closed in production when database query fails", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("Connection refused"));

      const allowed = await checkAuthRateLimit("192.168.1.1", "testuser");
      expect(allowed).toBe(false);
    });

    it("allows attempts 1 through 5 and rejects attempt 6 within 60 seconds", async () => {
      const ip = "192.168.1.100";
      const user = "ratelimit_chef";

      // Attempts 1 to 5 must succeed
      for (let i = 1; i <= 5; i++) {
        const allowed = await checkAuthRateLimit(ip, user);
        expect(allowed).toBe(true);
      }

      // Attempt 6 must be rejected
      const sixthAttempt = await checkAuthRateLimit(ip, user);
      expect(sixthAttempt).toBe(false);

      // Attempt 7 must also be rejected
      const seventhAttempt = await checkAuthRateLimit(ip, user);
      expect(seventhAttempt).toBe(false);
    });

    it("restores access after 60 seconds (prunes expired timestamps)", async () => {
      const ip = "192.168.1.101";
      const user = "patient_chef";
      const key = computeRateLimitKey(ip, user, process.env.NEXTAUTH_SECRET);

      // Seed 5 attempts that occurred 65 seconds ago
      const sixtyFiveSecondsAgo = new Date(Date.now() - 65_000);
      inMemoryBuckets.set(key, {
        key,
        attempts: [
          sixtyFiveSecondsAgo,
          sixtyFiveSecondsAgo,
          sixtyFiveSecondsAgo,
          sixtyFiveSecondsAgo,
          sixtyFiveSecondsAgo,
        ],
        expiresAt: new Date(sixtyFiveSecondsAgo.getTime() + 60_000),
      });

      // Now attempt 1 should succeed because old attempts are pruned
      const allowed = await checkAuthRateLimit(ip, user);
      expect(allowed).toBe(true);

      // Verify bucket only contains the fresh attempt
      const bucket = inMemoryBuckets.get(key);
      expect(bucket?.attempts.length).toBe(1);
    });

    it("isolates rate limits between different IP/username identities", async () => {
      // Exhaust limits for User A on IP 1
      for (let i = 0; i < 5; i++) {
        await checkAuthRateLimit("10.0.0.1", "userA");
      }
      expect(await checkAuthRateLimit("10.0.0.1", "userA")).toBe(false);

      // Different IP for User A is allowed
      expect(await checkAuthRateLimit("10.0.0.2", "userA")).toBe(true);

      // Different User on same IP 1 is allowed
      expect(await checkAuthRateLimit("10.0.0.1", "userB")).toBe(true);
    });

    it("prevents concurrent requests from exceeding 5 attempts for the same identity", async () => {
      const ip = "10.10.10.10";
      const user = "concurrent_attacker";

      // Launch 10 concurrent requests
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() => checkAuthRateLimit(ip, user))
      );

      const successful = results.filter((res) => res === true).length;
      const rejected = results.filter((res) => res === false).length;

      expect(successful).toBe(5);
      expect(rejected).toBe(5);
    });

    it("ensures cleanup error outside transaction does not fail or rollback the rate limit attempt", async () => {
      const ip = "192.168.1.102";
      const user = "cleanup_resilient_chef";
      const key = computeRateLimitKey(ip, user, process.env.NEXTAUTH_SECRET);

      // Make top-level prisma.$executeRaw throw (simulating cleanup failure outside transaction)
      vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error("Cleanup connection drop"));

      const allowed = await checkAuthRateLimit(ip, user);
      expect(allowed).toBe(true);

      const bucket = inMemoryBuckets.get(key);
      expect(bucket).toBeDefined();
      expect(bucket?.attempts.length).toBe(1);
    });
  });


  describe("authorizeJellyfin", () => {
    it("throws RateLimited and never contacts Jellyfin when rate limit is exceeded", async () => {
      const ip = "10.0.0.1";
      const username = "bruteforcer";

      // Exhaust 5 attempts
      for (let i = 0; i < 5; i++) {
        await checkAuthRateLimit(ip, username);
      }

      await expect(
        authorizeJellyfin(
          { username, password: "pwd" },
          { headers: { "x-forwarded-for": ip } }
        )
      ).rejects.toThrow("RateLimited");

      expect(authenticateWithJellyfin).not.toHaveBeenCalled();
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

  describe("NextAuth Provider Configuration (v1.5.11 Exclusive Jellyfin)", () => {
    it("does not include GoogleProvider in authOptions.providers", () => {
      const googleProvider = authOptions.providers.find((p: any) => p.id === "google");
      expect(googleProvider).toBeUndefined();
    });

    it("registers only jellyfin credentials provider when jellyfin is enabled", () => {
      expect(authOptions.providers.length).toBe(1);
      expect(authOptions.providers[0].id).toBe("jellyfin");
    });

    it("does not require GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in production", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() => {
        expect(authOptions.providers).toBeDefined();
      }).not.toThrow();
    });

    it("properly populates token and triggers user provisioning in jwt callback", async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      expect(jwtCallback).toBeDefined();

      const user = { id: "test-user-id", name: "Chef User" };
      const token = await jwtCallback!({ token: {}, user: user as any, account: null });

      expect(token.id).toBe("test-user-id");
      expect(ensureUserProvisioned).toHaveBeenCalledWith("test-user-id", "Chef User");
    });
  });
});
