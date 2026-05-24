import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import {
  calculateTargetCalories,
  allocateMacros,
  type ActivityLevel,
  type Gender,
} from '@/lib/fitness';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map PascalCase activity levels stored in DB to the camelCase keys fitness.ts expects. */
const ACTIVITY_LEVEL_MAP: Record<string, string> = {
  Sedentary: 'sedentary',
  Light: 'lightlyActive',
  Moderate: 'moderatelyActive',
  Active: 'veryActive',
  VeryActive: 'extraActive',
};

/** Derive the calorie delta from the user's stored goal string. */
function goalToDelta(goal: string): number {
  if (goal === 'Lose') return -500;
  if (goal === 'Gain') return 500;
  return 0;
}

/* ------------------------------------------------------------------ */
/*  GET  /api/weight?days=30                                           */
/* ------------------------------------------------------------------ */

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 730);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const entries = await prisma.weightLog.findMany({
      where: {
        userId,
        measuredAt: { gte: since },
      },
      orderBy: { measuredAt: 'asc' },
      select: {
        id: true,
        measuredAt: true,
        weightKg: true,
      },
    });

    // Compute stats
    let stats: { current: number; change: number; trend: 'losing' | 'gaining' | 'stable'; average: number } = { current: 0, change: 0, trend: 'stable', average: 0 };

    if (entries.length > 0) {
      const first = entries[0].weightKg;
      const last = entries[entries.length - 1].weightKg;
      const change = +(last - first).toFixed(2);
      const avg = +(entries.reduce((s, e) => s + e.weightKg, 0) / entries.length).toFixed(2);

      let trend: 'losing' | 'gaining' | 'stable' = 'stable';
      if (change < -0.3) trend = 'losing';
      else if (change > 0.3) trend = 'gaining';

      stats = { current: last, change, trend, average: avg };
    }

    return NextResponse.json({ entries, stats });
  } catch (error: unknown) {
    console.error('[GET /api/weight error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while loading weight data.' },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/weight   { weightKg: number }                            */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { weightKg } = body as { weightKg?: number };
    if (typeof weightKg !== 'number' || weightKg <= 0 || weightKg > 500) {
      return NextResponse.json(
        { error: 'weightKg must be a number between 0 and 500.' },
        { status: 400 },
      );
    }

    // 1. Create the weight log entry
    const entry = await prisma.weightLog.create({
      data: {
        userId,
        weightKg,
      },
    });

    // 2. Update UserProfile weight and recalculate targets
    const profile = await prisma.userProfile.findUnique({ where: { userId } });

    let updatedTargets = null;

    if (profile) {
      // Compute age from dateOfBirth
      const dob = new Date(profile.dateOfBirth);
      const ageYears = Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );

      const genderLower = (profile.gender as string).toLowerCase() as Gender;
      const activityLevelMapped = (ACTIVITY_LEVEL_MAP[profile.activityLevel as string] ||
        'sedentary') as ActivityLevel;
      const goalDelta = goalToDelta(profile.goal as string);

      const targetCalories = calculateTargetCalories({
        weightKg,
        heightCm: profile.heightCm,
        ageYears,
        gender: genderLower,
        activityLevel: activityLevelMapped,
        goalDelta,
      });

      const macros = allocateMacros({ targetCalories, weightKg });

      const updated = await prisma.userProfile.update({
        where: { userId },
        data: {
          weightKg,
          targetCalories: Math.round(targetCalories),
          targetProtein: macros.protein,
          targetCarbs: macros.carbs,
          targetFat: macros.fat,
        },
      });

      updatedTargets = {
        targetCalories: updated.targetCalories,
        targetProtein: updated.targetProtein,
        targetCarbs: updated.targetCarbs,
        targetFat: updated.targetFat,
      };
    }

    return NextResponse.json({ entry, updatedTargets });
  } catch (error: unknown) {
    console.error('[POST /api/weight error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while logging weight.' },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/weight?id=<entryId>                                    */
/* ------------------------------------------------------------------ */

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id query parameter.' }, { status: 400 });
    }

    // Verify ownership before deleting
    const existing = await prisma.weightLog.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Weight entry not found.' }, { status: 404 });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    await prisma.weightLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /api/weight error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting weight entry.' },
      { status: 500 },
    );
  }
}
