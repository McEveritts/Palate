import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGoogleAccessToken,
  hasCalendarScope,
  listUserCalendars,
  getOrCreateTargetCalendar,
  syncMealToGoogle,
  deleteMealFromGoogle,
} from "./googleCalendar";
import { prisma } from "@/lib/db";

// Mock `@/lib/db`
vi.mock("@/lib/db", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    userConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    scheduledMeal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Google Calendar Integration Utilities", () => {
  const mockUserId = "user-789";
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getGoogleAccessToken", () => {
    it("should return the stored access token if it is not expired", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        id: "account-123",
        userId: mockUserId,
        provider: "google",
        access_token: "active-token-abc",
        expires_at: now + 3600, // Expires in 1 hour
      });

      const token = await getGoogleAccessToken(mockUserId);
      expect(token).toBe("active-token-abc");
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId, provider: "google" },
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should refresh the token using refresh_token if it is expired", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        id: "account-123",
        userId: mockUserId,
        provider: "google",
        access_token: "expired-token",
        refresh_token: "refresh-token-xyz",
        expires_at: now - 10, // Expired 10 seconds ago
      });

      (prisma.account.update as any).mockResolvedValue({});

      // Mock Google OAuth token response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-token-123",
          expires_in: 3600,
        }),
      });

      const token = await getGoogleAccessToken(mockUserId);
      expect(token).toBe("new-token-123");
      expect(global.fetch).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.any(Object));
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: "account-123" },
        data: expect.objectContaining({
          access_token: "new-token-123",
        }),
      });
    });
  });

  describe("hasCalendarScope", () => {
    it("should return true if calendar scope exists", async () => {
      (prisma.account.findFirst as any).mockResolvedValue({
        scope: "openid email https://www.googleapis.com/auth/calendar profile",
      });

      const result = await hasCalendarScope(mockUserId);
      expect(result).toBe(true);
    });

    it("should return false if calendar scope is missing", async () => {
      (prisma.account.findFirst as any).mockResolvedValue({
        scope: "openid email profile",
      });

      const result = await hasCalendarScope(mockUserId);
      expect(result).toBe(false);
    });
  });

  describe("listUserCalendars", () => {
    it("should retrieve list of calendars if token exists", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        access_token: "active-token",
        expires_at: now + 3600,
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: "primary", summary: "My Daily Plan", primary: true },
            { id: "cal-family", summary: "Family Meals", primary: false },
          ],
        }),
      });

      const list = await listUserCalendars(mockUserId);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("primary");
      expect(list[0].summary).toBe("My Daily Plan");
      expect(list[0].primary).toBe(true);
      expect(list[1].id).toBe("cal-family");
    });
  });

  describe("getOrCreateTargetCalendar", () => {
    it("should return existing secondary calendar ID if it is still reachable", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        access_token: "active-token",
        expires_at: now + 3600,
      });
      (prisma.userConfig.findUnique as any).mockResolvedValue({
        googleCalendarSyncEnabled: true,
        googleCalendarId: "stored-cal-id",
      });

      // Mock calendar verify response
      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      const id = await getOrCreateTargetCalendar(mockUserId);
      expect(id).toBe("stored-cal-id");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/stored-cal-id",
        expect.any(Object)
      );
    });

    it("should create secondary calendar if set to create_sage_calendar and none exists", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        access_token: "active-token",
        expires_at: now + 3600,
      });
      (prisma.userConfig.findUnique as any).mockResolvedValue({
        googleCalendarSyncEnabled: true,
        googleCalendarId: "create_sage_calendar",
      });
      (prisma.userConfig.update as any).mockResolvedValue({});

      // Mock calendarList (returns empty list) and calendar creation response
      let fetchCallCount = 0;
      (global.fetch as any).mockImplementation(async (url: string, init?: any) => {
        fetchCallCount++;
        if (url.includes("calendarList")) {
          return {
            ok: true,
            json: async () => ({ items: [] }),
          };
        }
        if (url.includes("calendars") && init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({ id: "newly-created-sage-cal-id" }),
          };
        }
        return { ok: false };
      });

      const id = await getOrCreateTargetCalendar(mockUserId);
      expect(id).toBe("newly-created-sage-cal-id");
      expect(prisma.userConfig.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { googleCalendarId: "newly-created-sage-cal-id" },
      });
    });
  });

  describe("syncMealToGoogle", () => {
    it("should successfully construct clean title and place macros in description", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        access_token: "active-token",
        expires_at: now + 3600,
      });
      (prisma.userConfig.findUnique as any).mockResolvedValue({
        googleCalendarSyncEnabled: true,
        googleCalendarId: "stored-cal-id",
      });

      const mockMeal = {
        id: "meal-999",
        userId: mockUserId,
        mealType: "Dinner",
        date: new Date("2026-05-25T00:00:00.000Z"),
        plannedYield: 1.5,
        googleEventId: null,
        recipe: {
          id: "recipe-abc",
          title: "Tuscan Garlic Chicken",
          slug: "tuscan-garlic-chicken",
          frontmatter: {
            macros: {
              calories: 400,
              protein: 30,
              carbs: 10,
              fat: 20,
            },
          },
        },
      };

      (prisma.scheduledMeal.findUnique as any).mockResolvedValue(mockMeal);
      (prisma.scheduledMeal.update as any).mockResolvedValue({});

      // Mock verify, timezone fetch, and event creation
      (global.fetch as any).mockImplementation(async (url: string, init?: any) => {
        if (url.endsWith("calendars/stored-cal-id")) {
          return {
            ok: true,
            json: async () => ({ timeZone: "America/New_York" }),
          };
        }
        if (url.endsWith("events") && init?.method === "POST") {
          const body = JSON.parse(init.body);
          // Verify clean title
          expect(body.summary).toBe("Dinner: Tuscan Garlic Chicken");
          // Verify portion factor and scaled macros inside description
          expect(body.description).toContain("Planned Portion Yield: 1.50x");
          expect(body.description).toContain("Calories: 600 kcal"); // 400 * 1.5
          expect(body.description).toContain("Protein: 45g");       // 30 * 1.5
          expect(body.description).toContain("Carbs: 15g");         // 10 * 1.5
          expect(body.description).toContain("Fat: 30g");           // 20 * 1.5
          expect(body.description).toContain("/vault/tuscan-garlic-chicken");

          return {
            ok: true,
            json: async () => ({ id: "google-event-uuid-111" }),
          };
        }
        return { ok: true };
      });

      const synced = await syncMealToGoogle(mockUserId, "meal-999");
      expect(synced).toBe(true);
      expect(prisma.scheduledMeal.update).toHaveBeenCalledWith({
        where: { id: "meal-999" },
        data: { googleEventId: "google-event-uuid-111" },
      });
    });
  });

  describe("deleteMealFromGoogle", () => {
    it("should delete event from Google Calendar", async () => {
      const now = Math.floor(Date.now() / 1000);
      (prisma.account.findFirst as any).mockResolvedValue({
        access_token: "active-token",
        expires_at: now + 3600,
      });
      (prisma.userConfig.findUnique as any).mockResolvedValue({
        googleCalendarId: "stored-cal-id",
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      const success = await deleteMealFromGoogle(mockUserId, "event-to-delete-id");
      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/stored-cal-id/events/event-to-delete-id",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
