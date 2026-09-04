import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { encryptToken, decryptToken } from "./tokenEncryption";

type ScheduledMealWithRecipe = Prisma.ScheduledMealGetPayload<{
  include: { recipe: true };
}>;

export interface GoogleConnectionStatus {
  connected: boolean;
  hasCalendarScope: boolean;
  hasUsableCredentials: boolean;
  reason?: string;
}

/**
 * Centralized Google Calendar connection usability validator.
 * Used by Settings and runtime Calendar operations to guarantee alignment.
 */
export function validateGoogleCalendarConnection(
  account: {
    scope?: string | null;
    access_token?: string | null;
    refresh_token?: string | null;
  } | null
): GoogleConnectionStatus {
  if (!account) {
    return { connected: false, hasCalendarScope: false, hasUsableCredentials: false, reason: "no_account" };
  }

  const scopes = (account.scope || "").split(/\s+/);
  const hasScope = scopes.includes("https://www.googleapis.com/auth/calendar");
  if (!hasScope) {
    return { connected: false, hasCalendarScope: false, hasUsableCredentials: false, reason: "missing_calendar_scope" };
  }

  let hasValidRefreshToken = false;
  if (account.refresh_token) {
    try {
      const dec = decryptToken(account.refresh_token);
      if (dec && dec.trim() !== "") hasValidRefreshToken = true;
    } catch {
      hasValidRefreshToken = false;
    }
  }

  let hasValidAccessToken = false;
  if (account.access_token) {
    try {
      const dec = decryptToken(account.access_token);
      if (dec && dec.trim() !== "") hasValidAccessToken = true;
    } catch {
      hasValidAccessToken = false;
    }
  }

  const hasUsableCredentials = hasValidRefreshToken || hasValidAccessToken;
  return {
    connected: hasScope && hasUsableCredentials,
    hasCalendarScope: hasScope,
    hasUsableCredentials,
    reason: hasUsableCredentials ? undefined : "no_usable_tokens",
  };
}

/**
 * Retrieves a valid Google OAuth access token for a given user.
 * Decrypts tokens stored at rest. If the current access token is corrupt, missing,
 * or close to expiring, and a decryptable refresh token is available, it refreshes
 * the token via Google's token endpoint and saves newly re-encrypted tokens in the database.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  try {
    const account = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });

    if (!account) {
      return null;
    }

    let rawAccessToken: string | null = null;
    let accessTokenCorrupt = false;
    if (account.access_token) {
      try {
        rawAccessToken = decryptToken(account.access_token);
      } catch {
        accessTokenCorrupt = true;
      }
    }

    let rawRefreshToken: string | null = null;
    if (account.refresh_token) {
      try {
        rawRefreshToken = decryptToken(account.refresh_token);
      } catch {
        // Refresh token unreadable or corrupt
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpiredOrCorrupt =
      !rawAccessToken ||
      accessTokenCorrupt ||
      (account.expires_at !== null && account.expires_at !== undefined && account.expires_at <= now + 300);

    if (isExpiredOrCorrupt) {
      if (!rawRefreshToken) {
        console.error(`Google access token is expired or corrupt for user ${userId}, and no valid refresh token is stored.`);
        return null;
      }

      console.log(`Refreshing Google access token for user ${userId}...`);
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          grant_type: "refresh_token",
          refresh_token: rawRefreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to refresh Google OAuth token for user ${userId}:`, errorText);
        return null;
      }

      const data = await response.json();
      const updatedAccessToken = data.access_token;
      const updatedExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
      const newRefreshToken = data.refresh_token || rawRefreshToken;

      // Atomic Compare-And-Swap update:
      // Match the original access_token, refresh_token, and expires_at read before refresh
      const casResult = await prisma.account.updateMany({
        where: {
          id: account.id,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
        },
        data: {
          access_token: encryptToken(updatedAccessToken),
          expires_at: updatedExpiresAt,
          refresh_token: encryptToken(newRefreshToken),
        },
      });

      if (casResult.count === 0) {
        // A concurrent reconnect, refresh, or disconnect occurred!
        // Reload current active connection for this user and provider
        console.log(`CAS conflict during token refresh for user ${userId}. Validating current connection...`);
        const currentAccount = await prisma.account.findFirst({
          where: { userId, provider: "google" },
        });

        // Invariant: If account was deleted (disconnect) or replaced (reconnect), return null
        if (
          !currentAccount ||
          currentAccount.id !== account.id ||
          currentAccount.providerAccountId !== account.providerAccountId
        ) {
          console.warn(`[GoogleCalendar] Account was disconnected or replaced during refresh for user ${userId}. Refusing to return token.`);
          return null;
        }

        // Winning record belongs to same account: return winning decrypted access token
        if (currentAccount.access_token) {
          try {
            return decryptToken(currentAccount.access_token);
          } catch {
            return null;
          }
        }
        return null;
      }

      console.log(`Successfully refreshed Google access token for user ${userId}.`);
      return updatedAccessToken;
    }

    return rawAccessToken;
  } catch (error) {
    console.error(`Error in getGoogleAccessToken for user ${userId}:`, error);
    return null;
  }
}

/**
 * Checks if the user has granted the Google Calendar scope.
 */
export async function hasCalendarScope(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  return validateGoogleCalendarConnection(account).hasCalendarScope;
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

/**
 * Lists the user's available Google Calendars.
 */
export async function listUserCalendars(userId: string): Promise<GoogleCalendarItem[]> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return [];

  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to list calendars for user ${userId}:`, await response.text());
      return [];
    }

    const data = await response.json();
    return (data.items || []).map((item: {
      id: string;
      summary: string;
      description?: string;
      primary?: boolean;
      timeZone?: string;
      backgroundColor?: string;
      foregroundColor?: string;
    }) => ({
      id: item.id,
      summary: item.summary,
      description: item.description,
      primary: item.primary || false,
      timeZone: item.timeZone,
      backgroundColor: item.backgroundColor,
      foregroundColor: item.foregroundColor,
    }));
  } catch (error) {
    console.error(`Error in listUserCalendars for user ${userId}:`, error);
    return [];
  }
}

/**
 * Retrieves the dynamic calendar's timezone.
 */
export async function getCalendarTimeZone(userId: string, calendarId: string): Promise<string> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return "UTC";

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      return data.timeZone || "UTC";
    }
  } catch (err) {
    console.error("Failed to fetch calendar timezone:", err);
  }
  return "UTC";
}

/**
 * Resolves the calendar ID to sync to. If the user has selected a dedicated SageAI calendar,
 * it verifies if it exists. If not, it automatically creates it and saves its ID.
 */
export async function getOrCreateTargetCalendar(userId: string): Promise<string | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const config = await prisma.userConfig.findUnique({
    where: { userId },
  });

  if (!config || !config.googleCalendarSyncEnabled) return null;

  // Case 1: Default / Primary Calendar selected (empty, null, or "primary")
  if (!config.googleCalendarId || config.googleCalendarId === "primary") {
    return "primary";
  }

  // Case 2: User explicitly selected "create_sage_calendar" to create or use dedicated calendar
  if (config.googleCalendarId === "create_sage_calendar") {
    // First check if there's an existing secondary calendar with this name to avoid duplicates
    try {
      const calendars = await listUserCalendars(userId);
      const existingSageCal = calendars.find((c) => c.summary === "SageAI Culinary Calendar");
      if (existingSageCal) {
        await prisma.userConfig.update({
          where: { userId },
          data: { googleCalendarId: existingSageCal.id },
        });
        return existingSageCal.id;
      }
    } catch (err) {
      console.error("Error looking up existing SageAI calendar:", err);
    }

    // Create a new dedicated secondary calendar
    console.log(`Creating a new secondary calendar 'SageAI Culinary Calendar' for user ${userId}...`);
    try {
      const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "SageAI Culinary Calendar",
          description: "Your personalized culinary meal plan synced from SageAI (Palate)",
        }),
      });

      if (!createRes.ok) {
        console.error("Failed to create Google secondary calendar:", await createRes.text());
        return "primary"; // Fallback safely to primary
      }

      const calendar = await createRes.json();
      await prisma.userConfig.update({
        where: { userId },
        data: { googleCalendarId: calendar.id },
      });

      console.log(`Successfully created SageAI Culinary Calendar: ${calendar.id}`);
      return calendar.id;
    } catch (error) {
      console.error("Error creating secondary Google calendar:", error);
      return "primary"; // Fallback safely to primary
    }
  }

  // Case 3: Specific custom calendar ID selected
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.googleCalendarId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      return config.googleCalendarId;
    }
    console.warn(`Stored calendar ID ${config.googleCalendarId} was not reachable. Falling back to primary...`);
    return "primary";
  } catch {
    return "primary";
  }
}

/**
 * Synchronizes a scheduled meal database record with the selected Google Calendar.
 * Ensures the event title is clean, and places all detailed nutritional breakdown, yields,
 * and deep links inside the event description body.
 */
export async function syncMealToGoogle(
  userId: string,
  mealId: string,
  preloadedMeal?: ScheduledMealWithRecipe | null
): Promise<boolean> {
  try {
    const accessToken = await getGoogleAccessToken(userId);
    if (!accessToken) return false;

    const calendarId = await getOrCreateTargetCalendar(userId);
    if (!calendarId) return false;

    const meal = preloadedMeal || await prisma.scheduledMeal.findUnique({
      where: { id: mealId, userId },
      include: { recipe: true },
    });

    if (!meal) {
      console.warn(`Scheduled meal ${mealId} not found in database.`);
      return false;
    }

    // Get the timezone of the selected calendar
    const timeZone = await getCalendarTimeZone(userId, calendarId);

    // Format local times based on mealType (Breakfast, Lunch, Snack, Dinner)
    // We construct the YYYY-MM-DD string from the date
    const dateStr = meal.date.toISOString().split("T")[0]; // YYYY-MM-DD

    let startHour = "19:00:00"; // Default Dinner: 7:00 PM
    let endHour = "20:00:00";   // Dinner ends: 8:00 PM

    if (meal.mealType === "Breakfast") {
      startHour = "08:00:00";
      endHour = "08:30:00";
    } else if (meal.mealType === "Lunch") {
      startHour = "12:30:00";
      endHour = "13:00:00";
    } else if (meal.mealType === "Snack") {
      startHour = "15:30:00";
      endHour = "16:00:00";
    }

    const startDateTime = `${dateStr}T${startHour}`;
    const endDateTime = `${dateStr}T${endHour}`;

    // Clean Event Heading
    const summary = `${meal.mealType}: ${meal.recipe.title}`;

    // Rich Details strictly inside Description Body
    let description = "";
    description += `🌿 SageAI Culinary Sync\n`;
    description += `===================================\n\n`;
    description += `Recipe: ${meal.recipe.title}\n`;
    description += `Planned Portion Yield: ${meal.plannedYield.toFixed(2)}x\n\n`;

    // Extract and format macros if available in recipe frontmatter
    const frontmatter = meal.recipe.frontmatter as {
      macros?: string | {
        calories?: number;
        cal?: number;
        protein?: number;
        pro?: number;
        carbs?: number;
        carb?: number;
        fat?: number;
      };
    } | null;
    if (frontmatter && frontmatter.macros) {
      description += `📊 Macronutrient yield (${meal.plannedYield.toFixed(2)}x scaled):\n`;
      try {
        const rawMacros = frontmatter.macros;
        // Parse macros string or JSON
        if (typeof rawMacros === "string") {
          // Parse string like "450 kcal, 30g Protein, 40g Carbs, 15g Fat"
          const calMatch = rawMacros.match(/(\d+)\s*kcal/i);
          const proMatch = rawMacros.match(/(\d+)g\s*p/i) || rawMacros.match(/(\d+)g\s*protein/i);
          const carbMatch = rawMacros.match(/(\d+)g\s*c/i) || rawMacros.match(/(\d+)g\s*carb/i);
          const fatMatch = rawMacros.match(/(\d+)g\s*f/i) || rawMacros.match(/(\d+)g\s*fat/i);

          if (calMatch) {
            const cal = Math.round(parseInt(calMatch[1]) * meal.plannedYield);
            const pro = proMatch ? Math.round(parseInt(proMatch[1]) * meal.plannedYield) : 0;
            const carb = carbMatch ? Math.round(parseInt(carbMatch[1]) * meal.plannedYield) : 0;
            const fat = fatMatch ? Math.round(parseInt(fatMatch[1]) * meal.plannedYield) : 0;
            description += `- Calories: ${cal} kcal\n`;
            description += `- Protein: ${pro}g\n`;
            description += `- Carbs: ${carb}g\n`;
            description += `- Fat: ${fat}g\n\n`;
          } else {
            description += `- ${rawMacros}\n\n`;
          }
        } else if (typeof rawMacros === "object" && rawMacros !== null) {
          const cal = Math.round((rawMacros.calories || rawMacros.cal || 0) * meal.plannedYield);
          const pro = Math.round((rawMacros.protein || rawMacros.pro || 0) * meal.plannedYield);
          const carb = Math.round((rawMacros.carbs || rawMacros.carb || 0) * meal.plannedYield);
          const fat = Math.round((rawMacros.fat || 0) * meal.plannedYield);
          description += `- Calories: ${cal} kcal\n`;
          description += `- Protein: ${pro}g\n`;
          description += `- Carbs: ${carb}g\n`;
          description += `- Fat: ${fat}g\n\n`;
        }
      } catch {
        description += `- ${frontmatter.macros}\n\n`;
      }
    }

    // Direct Web Link back to Palate App
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:2814";
    description += `🔗 View Recipe in Palate Vault:\n`;
    description += `${appUrl}/vault/${meal.recipe.slug}\n\n`;
    description += `===================================\n`;
    description += `🌿 Bon Appétit! Meticulously scheduled by Sage.`;

    const eventBody = {
      summary,
      description,
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
    };

    if (meal.googleEventId) {
      // Endpoint to update existing event
      const updateRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${meal.googleEventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        }
      );

      if (updateRes.ok) {
        return true;
      }
      console.warn(`Failed to update Google event ${meal.googleEventId}. Attempting to re-create...`);
    }

    // Create a new event
    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!createRes.ok) {
      console.error(`Failed to create Google event for meal ${mealId}:`, await createRes.text());
      return false;
    }

    const event = await createRes.json();
    await prisma.scheduledMeal.update({
      where: { id: mealId },
      data: { googleEventId: event.id },
    });

    return true;
  } catch (error) {
    console.error(`Error syncing scheduled meal ${mealId} to Google Calendar:`, error);
    return false;
  }
}

/**
 * Removes a meal event from Google Calendar.
 */
export async function deleteMealFromGoogle(userId: string, googleEventId: string): Promise<boolean> {
  try {
    const accessToken = await getGoogleAccessToken(userId);
    if (!accessToken) return false;

    const config = await prisma.userConfig.findUnique({
      where: { userId },
    });

    if (!config || !config.googleCalendarId) return false;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.googleCalendarId)}/events/${googleEventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok || response.status === 404) {
      // 404 means the event was already deleted, which is a success for us
      return true;
    }

    console.error(`Failed to delete Google event ${googleEventId}:`, await response.text());
    return false;
  } catch (error) {
    console.error(`Error deleting Google event ${googleEventId}:`, error);
    return false;
  }
}

/**
 * Backfills current and upcoming meals to the user's selected Google Calendar.
 */
export async function backfillCalendarEvents(userId: string): Promise<number> {
  const config = await prisma.userConfig.findUnique({ where: { userId } });
  if (!config || !config.googleCalendarSyncEnabled) return 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const meals = await prisma.scheduledMeal.findMany({
    where: {
      userId,
      date: { gte: todayStart },
    },
    include: { recipe: true },
  });

  let count = 0;
  for (const meal of meals) {
    const ok = await syncMealToGoogle(userId, meal.id, meal);
    if (ok) count++;
  }
  return count;
}
