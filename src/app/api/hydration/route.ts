import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

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

// ── POST  /api/hydration ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { amountMl?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { amountMl } = body;

    // Validation
    if (typeof amountMl !== 'number' || amountMl <= 0) {
      return NextResponse.json({ error: 'amountMl must be > 0' }, { status: 400 });
    }
    if (amountMl > 5000) {
      return NextResponse.json({ error: 'amountMl must be <= 5000' }, { status: 400 });
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

    // Create the water entry and atomically increment the aggregate
    const [entry, updatedLog] = await prisma.$transaction([
      prisma.waterLogEntry.create({
        data: {
          dailyLogId: dailyLog.id,
          amountMl: Math.round(amountMl),
        },
      }),
      prisma.dailyLog.update({
        where: { id: dailyLog.id },
        data: {
          waterIntakeMl: { increment: Math.round(amountMl) },
        },
      }),
    ]);

    return NextResponse.json(
      { success: true, entry, totalWaterMl: updatedLog.waterIntakeMl },
      { status: 201 },
    );
  } catch (error) {
    console.error('[HydrationAPI] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── GET  /api/hydration?date=YYYY-MM-DD  or  ?month=YYYY-MM ────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the user's hydration goal (shared by both modes)
    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { targetWaterMl: true },
    });
    const targetWaterMl = profile?.targetWaterMl ?? 1893;

    // ── Bulk month mode: ?month=YYYY-MM ──────────────────
    const monthParam = req.nextUrl.searchParams.get('month');
    if (monthParam) {
      const match = monthParam.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
      }
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
      const startDate = new Date(Date.UTC(year, month, 1));
      const endDate = new Date(Date.UTC(year, month + 1, 0)); // last day of month

      const logs = await prisma.dailyLog.findMany({
        where: {
          userId: session.user.id,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          waterEntries: { orderBy: { timestamp: 'desc' } },
        },
        orderBy: { date: 'asc' },
      });

      const days = logs.map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        totalWaterMl: log.waterIntakeMl,
        targetWaterMl,
        entries: log.waterEntries,
      }));

      return NextResponse.json({ success: true, days }, { status: 200 });
    }

    // ── Single day mode: ?date=YYYY-MM-DD (default: today) ─
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
        waterEntries: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    const entries = dailyLog?.waterEntries ?? [];
    const totalWaterMl = dailyLog?.waterIntakeMl ?? 0;

    return NextResponse.json(
      { success: true, totalWaterMl, targetWaterMl, entries },
      { status: 200 },
    );
  } catch (error) {
    console.error('[HydrationAPI] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE  /api/hydration?id=<entryId> ────────────────────────────────────────
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
    const entry = await prisma.waterLogEntry.findUnique({
      where: { id: entryId },
      include: { dailyLog: { select: { id: true, userId: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    if (entry.dailyLog.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Decrement the aggregate and delete the entry atomically
    const [updatedLog] = await prisma.$transaction([
      prisma.dailyLog.update({
        where: { id: entry.dailyLog.id },
        data: {
          waterIntakeMl: { decrement: entry.amountMl },
        },
      }),
      prisma.waterLogEntry.delete({ where: { id: entryId } }),
    ]);

    return NextResponse.json({ deleted: true, totalWaterMl: updatedLog.waterIntakeMl });
  } catch (error) {
    console.error('[HydrationAPI] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH  /api/hydration (update goal) ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { targetWaterMl?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { targetWaterMl } = body;

    // Validation
    if (typeof targetWaterMl !== 'number' || targetWaterMl < 250) {
      return NextResponse.json({ error: 'targetWaterMl must be >= 250' }, { status: 400 });
    }
    if (targetWaterMl > 10000) {
      return NextResponse.json({ error: 'targetWaterMl must be <= 10000' }, { status: 400 });
    }

    const profile = await prisma.userProfile.update({
      where: { userId: session.user.id },
      data: { targetWaterMl: Math.round(targetWaterMl) },
    });

    return NextResponse.json({ success: true, targetWaterMl: profile.targetWaterMl });
  } catch (error) {
    console.error('[HydrationAPI] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
