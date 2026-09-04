import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptToken } from "@/lib/tokenEncryption";

const mockPrisma = vi.hoisted(() => ({
  userConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
  scheduledMeal: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

let mockSession: any = {
  user: { id: "user-123", name: "Chef User" },
};

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(async () => mockSession),
}));

vi.mock("@/lib/googleCalendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/googleCalendar")>();
  return {
    ...actual,
    listUserCalendars: vi.fn(async () => [
      { id: "cal-1", summary: "Personal Calendar", primary: true },
      { id: "cal-2", summary: "Meal Plan" },
    ]),
    backfillCalendarEvents: vi.fn(async () => 5),
  };
});

import { GET as settingsGET, POST as settingsPOST } from "@/app/api/settings/route";
import { POST as backfillPOST } from "@/app/api/settings/sync-backfill/route";

describe("Settings API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PALATE_ENCRYPTION_SECRET = "test-encryption-secret-32-chars-min";
    mockSession = { user: { id: "user-123", name: "Chef User" } };
  });

  describe("GET /api/settings", () => {
    it("returns 401 for unauthenticated request", async () => {
      mockSession = null;
      const res = await settingsGET();
      expect(res.status).toBe(401);
    });

    it("returns settings with Google Calendar connection status and calendars, never exposing tokens", async () => {
      mockPrisma.userConfig.findUnique.mockResolvedValueOnce({
        metricSystem: true,
        encryptedGcpKey: "enc-key",
        googleCalendarSyncEnabled: true,
        googleCalendarId: "cal-2",
      });

      const encToken = encryptToken("valid-token-secret-should-never-leak");
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: "acc-1",
        provider: "google",
        scope: "https://www.googleapis.com/auth/calendar",
        access_token: encToken,
        refresh_token: encToken,
      });

      const res = await settingsGET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.metricSystem).toBe(true);
      expect(json.hasKey).toBe(true);
      expect(json.hasGoogleConnection).toBe(true);
      expect(json.googleCalendarSyncEnabled).toBe(true);
      expect(json.googleCalendarId).toBe("cal-2");
      expect(json.calendars).toHaveLength(2);

      // Verify absolute token secrecy
      expect(json.access_token).toBeUndefined();
      expect(json.refresh_token).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain("should-never-be-leaked");
    });
  });

  describe("POST /api/settings", () => {
    it("updates Google Calendar sync preferences", async () => {
      mockPrisma.userConfig.upsert.mockResolvedValueOnce({
        metricSystem: false,
        encryptedGcpKey: null,
        googleCalendarSyncEnabled: true,
        googleCalendarId: "cal-2",
      });

      const encToken = encryptToken("valid-token-secret");
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: "acc-1",
        provider: "google",
        scope: "https://www.googleapis.com/auth/calendar",
        access_token: encToken,
      });

      const req = new Request("https://palate.example.com/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleCalendarSyncEnabled: true,
          googleCalendarId: "cal-2",
        }),
      });

      const res = await settingsPOST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.googleCalendarSyncEnabled).toBe(true);
      expect(json.googleCalendarId).toBe("cal-2");

      expect(mockPrisma.userConfig.upsert).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        update: expect.objectContaining({
          googleCalendarSyncEnabled: true,
          googleCalendarId: "cal-2",
        }),
        create: expect.objectContaining({
          userId: "user-123",
          googleCalendarSyncEnabled: true,
          googleCalendarId: "cal-2",
        }),
      });
    });

    it("verifies and encrypts valid Gemini API key using gemini-3.8-flash", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      global.fetch = mockFetch;

      mockPrisma.userConfig.upsert.mockResolvedValueOnce({
        metricSystem: true,
        encryptedGcpKey: "mock-encrypted",
      });

      const req = new Request("https://palate.example.com/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: "AIzaSyTestValidKey12345",
        }),
      });

      const res = await settingsPOST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=AIzaSyTestValidKey12345",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(mockPrisma.userConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-123" },
          update: expect.objectContaining({
            encryptedGcpKey: expect.any(String),
          }),
        })
      );
    });

    it("rejects invalid Gemini API key when Google API verification fails", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "API key not valid. Please pass a valid API key." },
        }),
      });
      global.fetch = mockFetch;

      const req = new Request("https://palate.example.com/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: "bad-invalid-key",
        }),
      });

      const res = await settingsPOST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Google API Error");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=bad-invalid-key",
        expect.any(Object)
      );
      expect(mockPrisma.userConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/settings/sync-backfill", () => {
    it("returns 401 for unauthenticated request", async () => {
      mockSession = null;
      const res = await backfillPOST();
      expect(res.status).toBe(401);
    });

    it("returns 400 if Google Calendar sync is disabled", async () => {
      mockPrisma.userConfig.findUnique.mockResolvedValueOnce({
        googleCalendarSyncEnabled: false,
      });

      const res = await backfillPOST();
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("not enabled");
    });

    it("triggers backfill when calendar sync is enabled", async () => {
      mockPrisma.userConfig.findUnique.mockResolvedValueOnce({
        googleCalendarSyncEnabled: true,
      });

      const res = await backfillPOST();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.syncedCount).toBe(5);
    });
  });
});
