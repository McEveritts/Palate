import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from "@/lib/auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Return a Date set to midnight UTC for the given YYYY-MM-DD string (or today). */
function toDateOnly(dateStr?: string | null): Date {
  if (dateStr) {
    const parsed = new Date(dateStr + 'T00:00:00.000Z');
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

// ── POST  /api/exercise ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { exerciseName?: string; durationMinutes?: number; caloriesBurned?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { exerciseName, durationMinutes, caloriesBurned } = body;

    // Validation
    if (!exerciseName || typeof exerciseName !== 'string' || exerciseName.trim().length === 0) {
      return NextResponse.json({ error: 'exerciseName is required' }, { status: 400 });
    }
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
      return NextResponse.json({ error: 'durationMinutes must be > 0' }, { status: 400 });
    }
    if (typeof caloriesBurned !== 'number' || caloriesBurned < 0) {
      return NextResponse.json({ error: 'caloriesBurned must be >= 0' }, { status: 400 });
    }

    const today = toDateOnly();

    // Upsert today's DailyLog
    const dailyLog = await prisma.dailyLog.upsert({
      where: {
        userId_date: {
          userId: session.user.id,
          date: today,
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        date: today,
      },
    });

    // Create the exercise entry
    const entry = await prisma.exerciseLogEntry.create({
      data: {
        dailyLogId: dailyLog.id,
        exerciseName: exerciseName.trim(),
        durationMinutes,
        caloriesBurned,
      },
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    console.error('[ExerciseAPI] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── GET  /api/exercise?date=YYYY-MM-DD ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dateParam = req.nextUrl.searchParams.get('date');
    const targetDate = toDateOnly(dateParam);

    const dailyLog = await prisma.dailyLog.findUnique({
      where: {
        userId_date: {
          userId: session.user.id,
          date: targetDate,
        },
      },
      include: {
        exerciseEntries: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    const entries = dailyLog?.exerciseEntries ?? [];
    return NextResponse.json({ success: true, entries }, { status: 200 });
  } catch (error) {
    console.error('[ExerciseAPI] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE  /api/exercise?id=<entryId> ─────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entryId = req.nextUrl.searchParams.get('id');
    if (!entryId) {
      return NextResponse.json({ error: 'Missing id query parameter' }, { status: 400 });
    }

    // Fetch the entry and verify ownership through the DailyLog
    const entry = await prisma.exerciseLogEntry.findUnique({
      where: { id: entryId },
      include: { dailyLog: { select: { userId: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    if (entry.dailyLog.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.exerciseLogEntry.delete({ where: { id: entryId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[ExerciseAPI] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
