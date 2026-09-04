import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptKey } from "@/lib/encryption";
import { SAGE_MODEL } from "@/lib/ai/model-config";
import { decryptToken } from "@/lib/tokenEncryption";
import {
  listUserCalendars,
  GoogleCalendarItem,
  validateGoogleCalendarConnection,
} from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const config = await prisma.userConfig.findUnique({
      where: { userId },
    });

    const googleAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });

    let hasGoogleConnection = false;
    let calendars: GoogleCalendarItem[] = [];

    const connectionStatus = validateGoogleCalendarConnection(googleAccount);
    if (connectionStatus.connected) {
      hasGoogleConnection = true;
      try {
        calendars = await listUserCalendars(userId);
      } catch (err) {
        console.warn("[Settings] Could not fetch Google calendars:", err);
      }
    }

    return NextResponse.json({
      success: true,
      metricSystem: config?.metricSystem ?? false,
      hasKey: !!config?.encryptedGcpKey,
      googleCalendarSyncEnabled: config?.googleCalendarSyncEnabled ?? false,
      googleCalendarId: config?.googleCalendarId ?? null,
      hasGoogleConnection,
      calendars,
    });
  } catch (error: unknown) {
    console.error("[GET /api/settings error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while loading settings." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const {
      geminiApiKey,
      measurementSystem,
      googleCalendarSyncEnabled,
      googleCalendarId,
    } = await req.json();

    // Prepare update data dynamically
    const updateData: {
      metricSystem?: boolean;
      encryptedGcpKey?: string | null;
      authTag?: string | null;
      iv?: string | null;
      googleCalendarSyncEnabled?: boolean;
      googleCalendarId?: string | null;
    } = {};

    if (measurementSystem !== undefined) {
      updateData.metricSystem = measurementSystem === "metric";
    }

    if (typeof googleCalendarSyncEnabled === "boolean") {
      if (googleCalendarSyncEnabled) {
        // Enforce prerequisite check before enabling sync:
        // Must have valid connection, usable decrypted credentials, and calendar scope
        const googleAccount = await prisma.account.findFirst({
          where: { userId, provider: "google" },
        });

        if (!googleAccount) {
          return NextResponse.json(
            { success: false, error: "Cannot enable sync without a connected Google Calendar account." },
            { status: 400 }
          );
        }

        let hasUsableToken = false;
        try {
          if (googleAccount.refresh_token && decryptToken(googleAccount.refresh_token)) {
            hasUsableToken = true;
          } else if (googleAccount.access_token && decryptToken(googleAccount.access_token)) {
            hasUsableToken = true;
          }
        } catch {
          hasUsableToken = false;
        }

        if (!hasUsableToken) {
          return NextResponse.json(
            { success: false, error: "Cannot enable sync: Google account credentials are unusable or corrupt." },
            { status: 400 }
          );
        }

        const scopes = (googleAccount.scope || "").split(/\s+/);
        if (!scopes.includes("https://www.googleapis.com/auth/calendar")) {
          return NextResponse.json(
            { success: false, error: "Cannot enable sync: Google account lacks required calendar permissions." },
            { status: 400 }
          );
        }
      }

      updateData.googleCalendarSyncEnabled = googleCalendarSyncEnabled;
    }

    if (googleCalendarId !== undefined) {
      if (googleCalendarId && googleCalendarId !== "primary" && googleCalendarId !== "create_sage_calendar") {
        try {
          const userCals = await listUserCalendars(userId);
          const found = userCals.some((c) => c.id === googleCalendarId);
          if (!found) {
            return NextResponse.json(
              { success: false, error: "Selected calendar was not found or is inaccessible." },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { success: false, error: "Unable to verify calendar access with Google." },
            { status: 400 }
          );
        }
      }
      updateData.googleCalendarId = googleCalendarId === "" ? null : googleCalendarId;
    }

    if (geminiApiKey !== undefined) {
      // If the key is empty/cleared, delete it from the config
      if (geminiApiKey.trim() === "") {
        updateData.encryptedGcpKey = null;
        updateData.authTag = null;
        updateData.iv = null;
      } else if (!geminiApiKey.startsWith("••••")) {
        // Live verify key validity with Google API before saving
        try {
          const testRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${SAGE_MODEL}:generateContent?key=${geminiApiKey.trim()}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "hi" }] }],
              }),
            }
          );
          if (!testRes.ok) {
            const errData = await testRes.json().catch(() => ({}));
            const errMsg = errData.error?.message || "Invalid API key.";
            return NextResponse.json(
              { success: false, error: `Google API Error: ${errMsg}` },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { success: false, error: "Failed to connect to Google API for verification." },
            { status: 400 }
          );
        }

        // Only encrypt if it's a raw new key (not the masked version sent from frontend)
        const encrypted = encryptKey(geminiApiKey.trim());
        updateData.encryptedGcpKey = encrypted.encryptedString;
        updateData.authTag = encrypted.authTag;
        updateData.iv = encrypted.iv;
      }
    }

    // Upsert UserConfig
    const config = await prisma.userConfig.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        metricSystem: false,
        ...updateData,
      },
    });

    const googleAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });

    let hasGoogleConnection = false;
    if (googleAccount) {
      const scopes = (googleAccount.scope || "").split(/\s+/);
      const hasScope = scopes.includes("https://www.googleapis.com/auth/calendar");
      try {
        if (
          hasScope &&
          ((googleAccount.refresh_token && decryptToken(googleAccount.refresh_token)) ||
            (googleAccount.access_token && decryptToken(googleAccount.access_token)))
        ) {
          hasGoogleConnection = true;
        }
      } catch {
        hasGoogleConnection = false;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Settings successfully updated!",
      metricSystem: config.metricSystem,
      hasKey: !!config.encryptedGcpKey,
      googleCalendarSyncEnabled: config.googleCalendarSyncEnabled,
      googleCalendarId: config.googleCalendarId,
      hasGoogleConnection,
    });
  } catch (error: unknown) {
    console.error("[POST /api/settings error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while saving settings." },
      { status: 500 }
    );
  }
}
