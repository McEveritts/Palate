import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/provisioning", () => ({
  ensureUserProvisioned: vi.fn(async () => undefined),
}));

import { authOptions } from "@/lib/auth";

describe("Jellyfin-Exclusive Session Provenance", () => {
  it("jwt callback stamps jellyfinAuthenticated and authProvider on sign-in", async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();

    const user = { id: "jellyfin-user-123", name: "Chef User" };
    const token = await jwtCallback!({
      token: {},
      user,
      account: null,
    });

    expect(token.id).toBe("jellyfin-user-123");
    expect(token.authProvider).toBe("jellyfin");
    expect(token.jellyfinAuthenticated).toBe(true);
  });

  it("session callback accepts valid Jellyfin-authenticated tokens", async () => {
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();

    const incomingSession = {
      user: { id: "jellyfin-user-123", name: "Chef User" },
      expires: "2099-01-01T00:00:00.000Z",
    };

    const validToken = {
      id: "jellyfin-user-123",
      authProvider: "jellyfin",
      jellyfinAuthenticated: true,
    };

    const session = await sessionCallback!({
      session: incomingSession,
      token: validToken,
      user: incomingSession.user as any,
      newSession: null,
      trigger: "update",
    });

    expect(session.user).toBeDefined();
    expect((session.user as any)?.id).toBe("jellyfin-user-123");
    expect((session as any).authProvider).toBe("jellyfin");
    expect((session as any).jellyfinAuthenticated).toBe(true);
  });

  it("session callback rejects legacy Google-era tokens lacking Jellyfin provenance marker", async () => {
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();

    const incomingSession = {
      user: { id: "google-era-user", name: "Google User" },
      expires: "2099-01-01T00:00:00.000Z",
    };

    // Legacy Google token: no jellyfinAuthenticated flag
    const legacyToken = {
      id: "google-era-user",
      email: "user@example.com",
    };

    const session = await sessionCallback!({
      session: incomingSession,
      token: legacyToken,
      user: incomingSession.user as any,
      newSession: null,
      trigger: "update",
    });

    // Must be unauthenticated (user undefined, jellyfinAuthenticated false)
    expect(session.user).toBeUndefined();
    expect((session as any).jellyfinAuthenticated).toBe(false);
  });
});
