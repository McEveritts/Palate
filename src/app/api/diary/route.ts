import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema for POST body validation
// ---------------------------------------------------------------------------
const foodEntrySchema = z.object({
  mealType: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  customFoodName: z.string().optional(),
  recipeId: z.string().optional(),
  amountConsumed: z.number().min(0, "amountConsumed must be >= 0").default(1),
  calories: z.number().min(0, "calories must be >= 0"),
  protein: z.number().min(0, "protein must be >= 0"),
  carbs: z.number().min(0, "carbs must be >= 0"),
  fat: z.number().min(0, "fat must be >= 0"),
  fiber: z.number().min(0).optional().default(0),
  sugar: z.number().min(0).optional().default(0),
  sodium: z.number().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Date set to midnight UTC for the given YYYY-MM-DD string, or today. */
function resolveDate(dateParam: string | null): Date {
  if (dateParam) {
    const parsed = new Date(`${dateParam}T00:00:00.000Z`);
    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid date format. Use YYYY-MM-DD.");
    }
    return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Recalculate and persist DailyLog aggregate totals from its entries. */
async function recalcAggregates(dailyLogId: string) {
  const entries = await prisma.foodLogEntry.findMany({
    where: { dailyLogId },
    select: { calories: true, protein: true, carbs: true, fat: true, fiber: true, sugar: true, sodium: true },
  });

  const totals = entries.reduce(
    (acc, e) => ({
      totalCalories: acc.totalCalories + e.calories,
      totalProtein: acc.totalProtein + e.protein,
      totalCarbs: acc.totalCarbs + e.carbs,
      totalFat: acc.totalFat + e.fat,
      totalFiber: acc.totalFiber + e.fiber,
      totalSugar: acc.totalSugar + e.sugar,
      totalSodium: acc.totalSodium + e.sodium,
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalFiber: 0, totalSugar: 0, totalSodium: 0 },
  );

  return prisma.dailyLog.update({
    where: { id: dailyLogId },
    data: totals,
  });
}

// ---------------------------------------------------------------------------
// GET  /api/diary?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);

    let date: Date;
    try {
      date = resolveDate(searchParams.get("date"));
    } catch {
      return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const dailyLog = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date } },
      include: {
        entries: { orderBy: { timestamp: "asc" } },
        exerciseEntries: { orderBy: { timestamp: "asc" } },
      },
    });

    if (!dailyLog) {
      return NextResponse.json({
        success: true,
        dailyLog: {
          date: date.toISOString(),
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
          totalFiber: 0,
          totalSugar: 0,
          totalSodium: 0,
          entries: [],
          exerciseEntries: [],
        },
      });
    }

    return NextResponse.json({ success: true, dailyLog });
  } catch (error: unknown) {
    console.error("[GET /api/diary error]:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while fetching diary." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST  /api/diary
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse raw JSON
    let rawData: unknown;
    try {
      rawData = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate against schema
    const parsed = foodEntrySchema.safeParse(rawData);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // Resolve today at midnight UTC
    const today = resolveDate(null);

    // Upsert the DailyLog for today
    const dailyLog = await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: today } },
      update: {},
      create: {
        userId,
        date: today,
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalFiber: 0,
        totalSugar: 0,
        totalSodium: 0,
      },
    });

    // Create the FoodLogEntry
    const entry = await prisma.foodLogEntry.create({
      data: {
        dailyLogId: dailyLog.id,
        mealType: data.mealType,
        customFoodName: data.customFoodName ?? null,
        recipeId: data.recipeId ?? null,
        amountConsumed: data.amountConsumed,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        fiber: data.fiber ?? 0,
        sugar: data.sugar ?? 0,
        sodium: data.sodium ?? 0,
      },
    });

    // Recalculate aggregate totals
    const updatedLog = await recalcAggregates(dailyLog.id);

    return NextResponse.json({
      success: true,
      entry,
      dailyLog: updatedLog,
    });
  } catch (error: unknown) {
    console.error("[POST /api/diary error]:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while adding diary entry." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE  /api/diary?id=<entryId>
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const entryId = searchParams.get("id");

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: "Missing required query param: id" },
        { status: 400 },
      );
    }

    // Fetch entry + its parent DailyLog to verify ownership
    const entry = await prisma.foodLogEntry.findUnique({
      where: { id: entryId },
      include: { dailyLog: { select: { id: true, userId: true } } },
    });

    if (!entry) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    if (entry.dailyLog.userId !== userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dailyLogId = entry.dailyLog.id;

    // Delete the entry
    await prisma.foodLogEntry.delete({ where: { id: entryId } });

    // Recalculate aggregate totals
    const updatedLog = await recalcAggregates(dailyLogId);

    return NextResponse.json({ success: true, dailyLog: updatedLog });
  } catch (error: unknown) {
    console.error("[DELETE /api/diary error]:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while deleting diary entry." },
      { status: 500 },
    );
  }
}
