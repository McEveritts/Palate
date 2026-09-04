import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { backfillCalendarEvents } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check user configuration
    const config = await prisma.userConfig.findUnique({
      where: { userId },
    });

    if (!config || !config.googleCalendarSyncEnabled) {
      return NextResponse.json(
        { error: "Google Calendar synchronization is not enabled." },
        { status: 400 }
      );
    }

    const syncedCount = await backfillCalendarEvents(userId);

    return NextResponse.json({
      success: true,
      syncedCount,
      message: `Successfully synchronized ${syncedCount} meals to your Google Calendar.`,
    });
  } catch (error: unknown) {
    console.error("[POST /api/settings/sync-backfill error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during calendar backfill." },
      { status: 500 }
    );
  }
}
