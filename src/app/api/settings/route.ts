import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptKey } from "@/lib/encryption";
import { hasCalendarScope, listUserCalendars } from "@/lib/googleCalendar";

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

    const isCalendarScopeGranted = await hasCalendarScope(userId);
    let calendars: unknown[] = [];
    if (isCalendarScopeGranted) {
      calendars = await listUserCalendars(userId);
    }

    return NextResponse.json({
      success: true,
      metricSystem: config?.metricSystem ?? false,
      hasKey: !!config?.encryptedGcpKey,
      googleCalendarSyncEnabled: config?.googleCalendarSyncEnabled ?? false,
      googleCalendarId: config?.googleCalendarId ?? null,
      hasCalendarScope: isCalendarScopeGranted,
      googleCalendars: calendars,
    });
  } catch (error: unknown) {
    console.error("[GET /api/settings error]:", error);
    return NextResponse.json({ error: "An unexpected error occurred while loading settings." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { geminiApiKey, measurementSystem, googleCalendarSyncEnabled, googleCalendarId } = await req.json();

    // Prepare update data dynamically
    const updateData: {
      metricSystem?: boolean;
      googleCalendarSyncEnabled?: boolean;
      googleCalendarId?: string | null;
      encryptedGcpKey?: string | null;
      authTag?: string | null;
      iv?: string | null;
    } = {};

    if (measurementSystem !== undefined) {
      updateData.metricSystem = measurementSystem === "metric";
    }

    if (googleCalendarSyncEnabled !== undefined) {
      updateData.googleCalendarSyncEnabled = googleCalendarSyncEnabled;
    }

    if (googleCalendarId !== undefined) {
      updateData.googleCalendarId = googleCalendarId;
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey.trim()}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "hi" }] }]
              })
            }
          );
          if (!testRes.ok) {
            const errData = await testRes.json().catch(() => ({}));
            const errMsg = errData.error?.message || "Invalid API key.";
            return NextResponse.json({ success: false, error: `Google API Error: ${errMsg}` }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ success: false, error: "Failed to connect to Google API for verification." }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      message: "API key successfully verified and saved!",
      metricSystem: config.metricSystem,
      hasKey: !!config.encryptedGcpKey,
      googleCalendarSyncEnabled: config.googleCalendarSyncEnabled,
      googleCalendarId: config.googleCalendarId,
    });
  } catch (error: unknown) {
    console.error("[POST /api/settings error]:", error);
    return NextResponse.json({ error: "An unexpected error occurred while saving settings." }, { status: 500 });
  }
}

