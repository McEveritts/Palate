import { prisma } from "@/lib/db";
import {
  allocateMacros,
  calculateTargetCalories,
  type ActivityLevel,
  type Gender,
} from "@/lib/fitness";

export type SageLogToolName =
  | "log_food_consumption"
  | "log_exercise"
  | "log_hydration"
  | "log_weight";

export interface SagePersistContext {
  localHour?: number;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function mealTypeForHour(localHour?: number): "Breakfast" | "Lunch" | "Dinner" | "Snack" {
  const hour = Number.isInteger(localHour) && localHour! >= 0 && localHour! <= 23
    ? localHour!
    : new Date().getUTCHours();
  if (hour < 11) return "Breakfast";
  if (hour < 15) return "Lunch";
  if (hour < 20) return "Dinner";
  return "Snack";
}

const ACTIVITY_LEVEL_MAP: Record<string, ActivityLevel> = {
  Sedentary: "sedentary",
  Light: "lightlyActive",
  Moderate: "moderatelyActive",
  Active: "veryActive",
  VeryActive: "extraActive",
};

function goalToDelta(goal: string): number {
  if (goal === "Lose") return -500;
  if (goal === "Gain") return 500;
  return 0;
}

export async function persistSageToolLog(
  userId: string,
  toolName: SageLogToolName,
  args: Record<string, unknown>,
  context: SagePersistContext = {},
): Promise<Record<string, unknown>> {
  if (toolName === "log_food_consumption") {
    const calories = Math.round(Number(args.calories) || 0);
    const protein = Math.round(Number(args.protein) || 0);
    const carbs = Math.round(Number(args.carbs) || 0);
    const fat = Math.round(Number(args.fat) || 0);
    const dailyLog = await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: todayUtc() } },
      update: {},
      create: { userId, date: todayUtc() },
    });
    const [entry, updatedLog] = await prisma.$transaction([
      prisma.foodLogEntry.create({
        data: {
          dailyLogId: dailyLog.id,
          mealType: mealTypeForHour(context.localHour),
          customFoodName: String(args.food_name),
          amountConsumed: 1,
          calories,
          protein,
          carbs,
          fat,
        },
      }),
      prisma.dailyLog.update({
        where: { id: dailyLog.id },
        data: {
          totalCalories: { increment: calories },
          totalProtein: { increment: protein },
          totalCarbs: { increment: carbs },
          totalFat: { increment: fat },
        },
      }),
    ]);
    return {
      entryId: entry.id,
      dailyLogId: dailyLog.id,
      totals: {
        calories: updatedLog.totalCalories,
        protein: updatedLog.totalProtein,
        carbs: updatedLog.totalCarbs,
        fat: updatedLog.totalFat,
      },
    };
  }

  if (toolName === "log_exercise") {
    const durationMinutes = Math.max(1, Math.round(Number(args.duration_minutes)));
    const caloriesBurned = Math.round(Number(args.calories_burned) || 0);
    const dailyLog = await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: todayUtc() } },
      update: {},
      create: { userId, date: todayUtc() },
    });
    const entry = await prisma.exerciseLogEntry.create({
      data: {
        dailyLogId: dailyLog.id,
        exerciseName: String(args.exercise_name),
        durationMinutes,
        caloriesBurned,
      },
    });
    return { entryId: entry.id, dailyLogId: dailyLog.id };
  }

  if (toolName === "log_hydration") {
    const amountMl = Math.round(Number(args.amount_ml));
    const dailyLog = await prisma.dailyLog.upsert({
      where: { userId_date: { userId, date: todayUtc() } },
      update: {},
      create: { userId, date: todayUtc() },
    });
    const [entry, updatedLog] = await prisma.$transaction([
      prisma.waterLogEntry.create({
        data: { dailyLogId: dailyLog.id, amountMl },
      }),
      prisma.dailyLog.update({
        where: { id: dailyLog.id },
        data: { waterIntakeMl: { increment: amountMl } },
      }),
    ]);
    return {
      entryId: entry.id,
      dailyLogId: dailyLog.id,
      totalWaterMl: updatedLog.waterIntakeMl,
    };
  }

  const weightKg = Number(args.weight_kg);
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) {
    const entry = await prisma.weightLog.create({ data: { userId, weightKg } });
    return { entryId: entry.id };
  }

  const dob = new Date(profile.dateOfBirth);
  const ageYears = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const targetCalories = calculateTargetCalories({
    weightKg,
    heightCm: profile.heightCm,
    ageYears,
    gender: String(profile.gender).toLowerCase() as Gender,
    activityLevel: ACTIVITY_LEVEL_MAP[String(profile.activityLevel)] || "sedentary",
    goalDelta: goalToDelta(String(profile.goal)),
  });
  const macros = allocateMacros({ targetCalories, weightKg });
  const [entry, updatedProfile] = await prisma.$transaction([
    prisma.weightLog.create({ data: { userId, weightKg } }),
    prisma.userProfile.update({
      where: { userId },
      data: {
        weightKg,
        targetCalories: Math.round(targetCalories),
        targetProtein: macros.protein,
        targetCarbs: macros.carbs,
        targetFat: macros.fat,
      },
    }),
  ]);
  return {
    entryId: entry.id,
    updatedTargets: {
      targetCalories: updatedProfile.targetCalories,
      targetProtein: updatedProfile.targetProtein,
      targetCarbs: updatedProfile.targetCarbs,
      targetFat: updatedProfile.targetFat,
    },
  };
}
