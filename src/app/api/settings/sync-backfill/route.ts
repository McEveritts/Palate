import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { syncMealToGoogle } from "@/lib/googleCalendar";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch all future scheduled meals for the user
    // (greater than or equal to the start of today to ensure future planning is covered)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const meals = await prisma.scheduledMeal.findMany({
      where: {
        userId,
        date: {
          gte: todayStart,
        },
      },
      select: {
        id: true,
      },
    });

    console.log(`Backfilling Google Calendar with ${meals.length} scheduled meals for user ${userId}...`);

    let successCount = 0;
    let failureCount = 0;

    for (const meal of meals) {
      const synced = await syncMealToGoogle(userId, meal.id);
      if (synced) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total: meals.length,
      synced: successCount,
      failed: failureCount,
    });
  } catch (error: any) {
    console.error("POST /api/settings/sync-backfill error:", error);
    return NextResponse.json({ error: error.message || "Failed to backfill calendar sync" }, { status: 500 });
  }
}
