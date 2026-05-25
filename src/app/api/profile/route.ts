import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from 'zod';
import {
  calculateTargetCalories,
  allocateMacros,
  TargetCaloriesParams,
  ActivityLevel,
  Gender
} from "@/lib/fitness";

const profileSchema = z.object({
  gender: z.enum(['Male', 'Female', 'Other']),
  dateOfBirth: z.string().datetime().or(z.string().date()),
  weightKg: z.number().min(20).max(500),
  heightCm: z.number().min(50).max(300),
  activityLevel: z.enum(['Sedentary', 'Light', 'Moderate', 'Active', 'VeryActive']),
  goal: z.enum(['Lose', 'Maintain', 'Gain']),
  goalDelta: z.number().min(-1000).max(1000).optional(),
});

/** Map PascalCase activity levels from the schema to the PAL_COEFFICIENTS keys in fitness.ts */
const ACTIVITY_LEVEL_MAP: Record<string, string> = {
  Sedentary: 'sedentary',
  Light: 'lightlyActive',
  Moderate: 'moderatelyActive',
  Active: 'veryActive',
  VeryActive: 'extraActive',
};

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ success: true, profile: null });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error: unknown) {
    console.error("[GET /api/profile error]:", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred while loading profile." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse raw JSON — catch malformed bodies separately
    let rawData: unknown;
    try {
      rawData = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate against schema
    const parsed = profileSchema.safeParse(rawData);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // Calculate age from date of birth
    const dob = new Date(data.dateOfBirth);
    const ageYears = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    // Determine goalDelta — use provided value or derive from goal
    const goalDelta = data.goalDelta ?? (data.goal === 'Lose' ? -500 : data.goal === 'Gain' ? 500 : 0);

    // Map PascalCase enums to the lowercase keys fitness.ts expects
    const genderLower = data.gender.toLowerCase() as Gender;
    const activityLevelMapped = ACTIVITY_LEVEL_MAP[data.activityLevel] as ActivityLevel;

    const params: TargetCaloriesParams = {
      weightKg: data.weightKg,
      heightCm: data.heightCm,
      ageYears,
      gender: genderLower,
      activityLevel: activityLevelMapped,
      goalDelta,
    };

    const targetCalories = calculateTargetCalories(params);
    const macros = allocateMacros({
      targetCalories,
      weightKg: data.weightKg,
    });

    const updateData = {
      gender: data.gender,
      dateOfBirth: dob,
      weightKg: data.weightKg,
      heightCm: data.heightCm,
      activityLevel: data.activityLevel,
      goal: data.goal,
      targetCalories: Math.round(targetCalories),
      targetProtein: macros.protein,
      targetCarbs: macros.carbs,
      targetFat: macros.fat,
    };

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
      },
    });

    return NextResponse.json({
      success: true,
      profile,
    });

  } catch (error: unknown) {
    console.error("[POST /api/profile error]:", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred while saving profile." }, { status: 500 });
  }
}
