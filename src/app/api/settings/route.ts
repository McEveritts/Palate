import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { encryptKey } from "@/lib/encryption";
import { hasCalendarScope, listUserCalendars } from "@/lib/googleCalendar";

export async function GET(req: Request) {
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
    let calendars: any[] = [];
    if (isCalendarScopeGranted) {
      calendars = await listUserCalendars(userId);
    }

    return NextResponse.json({
      success: true,
      metricSystem: config?.metricSystem ?? true,
      hasKey: !!config?.encryptedGcpKey,
      googleCalendarSyncEnabled: config?.googleCalendarSyncEnabled ?? false,
      googleCalendarId: config?.googleCalendarId ?? null,
      hasCalendarScope: isCalendarScopeGranted,
      googleCalendars: calendars,
    });
  } catch (error: any) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: error.message || "Failed to load settings" }, { status: 500 });
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
    const updateData: any = {};

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
        metricSystem: true,
        ...updateData,
      },
    });

    return NextResponse.json({
      success: true,
      metricSystem: config.metricSystem,
      hasKey: !!config.encryptedGcpKey,
      googleCalendarSyncEnabled: config.googleCalendarSyncEnabled,
      googleCalendarId: config.googleCalendarId,
    });
  } catch (error: any) {
    console.error("POST /api/settings error:", error);
    return NextResponse.json({ error: error.message || "Failed to save settings" }, { status: 500 });
  }
}

