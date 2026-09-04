import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { encryptToken } from "@/lib/tokenEncryption";
import { encryptOAuthState } from "@/lib/oauthState";

// Mock dependencies
const mockPrisma: any = vi.hoisted(() => {
  const p: any = {
    account: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    userConfig: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return await cb(p);
      }
      return Promise.all(cb);
    }),
  };
  return p;
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

let mockSession: any = {
  user: { id: "jellyfin-user-1", name: "Chef Gordon" },
  authProvider: "jellyfin",
  jellyfinAuthenticated: true,
};

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => mockSession),
}));

import { GET as connectGET } from "@/app/api/integrations/google-calendar/connect/route";
import { GET as callbackGET } from "@/app/api/integrations/google-calendar/callback/route";
import { POST as disconnectPOST } from "@/app/api/integrations/google-calendar/disconnect/route";

describe("Google Calendar Connected Integration Endpoints", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    mockSession = {
      user: { id: "jellyfin-user-1", name: "Chef Gordon" },
      authProvider: "jellyfin",
      jellyfinAuthenticated: true,
    };
    process.env = {
      ...originalEnv,
      PALATE_ENCRYPTION_SECRET: "test-encryption-secret-32-chars-min",
      GOOGLE_CLIENT_ID: "google-client-id-xyz",
      GOOGLE_CLIENT_SECRET: "google-client-secret-abc",
      NEXTAUTH_URL: "https://palate.example.com",
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe("GET /api/integrations/google-calendar/connect", () => {
    it("redirects unauthenticated users to /login", async () => {
      mockSession = null;
      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/connect");
      const res = await connectGET(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("initiates OAuth flow with PKCE and sets encrypted HttpOnly state cookie", async () => {
      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/connect");
      const res = await connectGET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(location).toContain("code_challenge=");
      expect(location).toContain("code_challenge_method=S256");
      expect(location).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar");

      // Verify cookie
      const cookies = res.cookies.get("palate_gcal_oauth_state");
      expect(cookies).toBeDefined();
      expect(cookies?.value.startsWith("enc:state:v1:")).toBe(true);
      expect(cookies?.httpOnly).toBe(true);
    });
  });

  describe("GET /api/integrations/google-calendar/callback", () => {
    it("rejects callback if active Jellyfin session is missing", async () => {
      mockSession = null;
      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=abc&state=xyz");
      const res = await callbackGET(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=session_required");
    });

    it("rejects callback if state cookie is missing", async () => {
      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=abc&state=xyz");
      const res = await callbackGET(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=missing_oauth_state");
    });

    it("rejects callback if state param does not match state cookie", async () => {
      const stateCookie = encryptOAuthState({
        state: "state-token-at-least-32-chars-matching-schema",
        codeVerifier: "code-verifier-at-least-32-chars-matching-schema",
        userId: "jellyfin-user-1",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });

      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=abc&state=different-state-at-least-32-chars-matching");
      req.cookies.set("palate_gcal_oauth_state", stateCookie);

      const res = await callbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=state_mismatch");
    });

    it("rejects callback if state cookie belongs to a different user", async () => {
      const stateCookie = encryptOAuthState({
        state: "matching-state-at-least-32-chars-schema",
        codeVerifier: "code-verifier-at-least-32-chars-matching-schema",
        userId: "different-user-999",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });

      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=abc&state=matching-state-at-least-32-chars-schema");
      req.cookies.set("palate_gcal_oauth_state", stateCookie);

      const res = await callbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=user_mismatch");
    });

    it("rejects callback if Google account is already attached to another Palate user (prevents cross-user account takeover)", async () => {
      const stateCookie = encryptOAuthState({
        state: "valid-state-at-least-32-chars-schema-long",
        codeVerifier: "code-verifier-at-least-32-chars-matching-schema",
        userId: "jellyfin-user-1",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });

      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=google-auth-code&state=valid-state-at-least-32-chars-schema-long");
      req.cookies.set("palate_gcal_oauth_state", stateCookie);

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "raw-google-access-token",
            refresh_token: "raw-google-refresh-token",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar",
            token_type: "Bearer",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sub: "google-sub-already-claimed" }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      // Mock existing account attached to user-2
      mockPrisma.account.findUnique.mockResolvedValueOnce({
        id: "acc-1",
        userId: "jellyfin-user-2", // DIFFERENT USER
        provider: "google",
        providerAccountId: "google-sub-already-claimed",
      });

      const res = await callbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=account_already_linked_to_another_user");
    });

    it("successfully exchanges tokens, encrypts at rest, and binds to active Jellyfin user", async () => {
      const stateCookie = encryptOAuthState({
        state: "valid-state-at-least-32-chars-schema-long",
        codeVerifier: "code-verifier-at-least-32-chars-matching-schema",
        userId: "jellyfin-user-1",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      });

      const req = new NextRequest("https://palate.example.com/api/integrations/google-calendar/callback?code=google-auth-code&state=valid-state-at-least-32-chars-schema-long");
      req.cookies.set("palate_gcal_oauth_state", stateCookie);

      // Mock Google token exchange response
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "raw-google-access-token",
            refresh_token: "raw-google-refresh-token",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar",
            token_type: "Bearer",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sub: "google-sub-new" }),
        });

      mockPrisma.account.findUnique.mockResolvedValueOnce(null); // No collision on sub
      mockPrisma.account.findFirst.mockResolvedValueOnce(null); // No existing account for user
      mockPrisma.account.create.mockResolvedValueOnce({ id: "acc-new" });

      const res = await callbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("connected=google_calendar");

      // Verify account was created with encrypted tokens
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "jellyfin-user-1",
          provider: "google",
          providerAccountId: "google-sub-new",
          access_token: expect.stringMatching(/^enc:v1:/),
          refresh_token: expect.stringMatching(/^enc:v1:/),
        }),
      });

      // Verify UserConfig initialized with default-off sync
      expect(mockPrisma.userConfig.upsert).toHaveBeenCalledWith({
        where: { userId: "jellyfin-user-1" },
        create: expect.objectContaining({ googleCalendarSyncEnabled: false }),
        update: expect.any(Object),
      });
    });
  });

  describe("POST /api/integrations/google-calendar/disconnect", () => {
    it("rejects unauthenticated disconnect request with 401", async () => {
      mockSession = null;
      const res = await disconnectPOST();
      expect(res.status).toBe(401);
    });

    it("revokes token upstream, deletes account, and resets user config", async () => {
      mockPrisma.account.findMany.mockResolvedValueOnce([
        {
          id: "acc-1",
          userId: "jellyfin-user-1",
          provider: "google",
          refresh_token: encryptToken("my-refresh-token"),
          access_token: null,
        },
      ]);

      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await disconnectPOST();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify revocation was sent
      expect(global.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/revoke",
        expect.objectContaining({
          method: "POST",
          body: expect.any(URLSearchParams),
        })
      );

      // Verify account deleted
      expect(mockPrisma.account.deleteMany).toHaveBeenCalledWith({
        where: { userId: "jellyfin-user-1", provider: "google" },
      });

      // Verify userConfig disabled
      expect(mockPrisma.userConfig.updateMany).toHaveBeenCalledWith({
        where: { userId: "jellyfin-user-1" },
        data: { googleCalendarSyncEnabled: false, googleCalendarId: null },
      });
    });
  });
});
