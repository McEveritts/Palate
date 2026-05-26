import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from "@/lib/auth";
import { prisma } from '@/lib/db';

/* ------------------------------------------------------------------ */
/*  GET /api/fasting                                                 */
/*  Fetches the active fast and recent completed fasts.               */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. Get the current active fast (endTime is null)
    const activeFast = await prisma.fastingLog.findFirst({
      where: {
        userId,
        endTime: null,
      },
      orderBy: { startTime: 'desc' },
    });

    // 2. Get recent completed fasts (e.g., last 7 fasts)
    const completedFasts = await prisma.fastingLog.findMany({
      where: {
        userId,
        endTime: { not: null },
      },
      orderBy: { startTime: 'desc' },
      take: 7,
    });

    return NextResponse.json({ activeFast, completedFasts });
  } catch (error: unknown) {
    console.error('[GET /api/fasting error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching fasting logs.' },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/fasting                                                */
/*  Starts a new fast. Auto-closes any existing active fast.          */
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

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body structure.' }, { status: 400 });
    }

    const { startTime: rawStartTime, targetHours = 16 } = body as {
      startTime?: string;
      targetHours?: number;
    };

    const startTime = rawStartTime ? new Date(rawStartTime) : new Date();
    if (isNaN(startTime.getTime())) {
      return NextResponse.json({ error: 'Invalid startTime format.' }, { status: 400 });
    }

    if (typeof targetHours !== 'number' || targetHours <= 0 || targetHours > 168) {
      return NextResponse.json({ error: 'targetHours must be a number between 1 and 168.' }, { status: 400 });
    }

    // 1. Auto-close any active fasts
    const activeFast = await prisma.fastingLog.findFirst({
      where: {
        userId,
        endTime: null,
      },
      orderBy: { startTime: 'desc' },
    });

    if (activeFast) {
      const autoEndTime = new Date();
      const elapsedHours = (autoEndTime.getTime() - activeFast.startTime.getTime()) / (1000 * 60 * 60);
      const isCompleted = elapsedHours >= activeFast.targetHours;

      await prisma.fastingLog.update({
        where: { id: activeFast.id },
        data: {
          endTime: autoEndTime,
          completed: isCompleted,
        },
      });
    }

    // 2. Start new fast
    const newFast = await prisma.fastingLog.create({
      data: {
        userId,
        startTime,
        targetHours,
        completed: false,
      },
    });

    return NextResponse.json(newFast);
  } catch (error: unknown) {
    console.error('[POST /api/fasting error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while starting the fast.' },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/fasting                                               */
/*  Stops an active fast OR edits an existing fast.                  */
/* ------------------------------------------------------------------ */
export async function PATCH(req: Request) {
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

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body structure.' }, { status: 400 });
    }

    const { action, id, startTime: rawStartTime, endTime: rawEndTime, targetHours } = body as {
      action?: 'stop' | 'edit';
      id?: string;
      startTime?: string;
      endTime?: string;
      targetHours?: number;
    };

    if (action === 'stop') {
      // Find the currently active fast
      const activeFast = await prisma.fastingLog.findFirst({
        where: {
          userId,
          endTime: null,
        },
        orderBy: { startTime: 'desc' },
      });

      if (!activeFast) {
        return NextResponse.json({ error: 'No active fast to stop.' }, { status: 404 });
      }

      const stopTime = rawEndTime ? new Date(rawEndTime) : new Date();
      if (isNaN(stopTime.getTime())) {
        return NextResponse.json({ error: 'Invalid endTime format.' }, { status: 400 });
      }

      if (stopTime < activeFast.startTime) {
        return NextResponse.json({ error: 'End time cannot be earlier than start time.' }, { status: 400 });
      }

      const elapsedHours = (stopTime.getTime() - activeFast.startTime.getTime()) / (1000 * 60 * 60);
      const isCompleted = elapsedHours >= activeFast.targetHours;

      const stoppedFast = await prisma.fastingLog.update({
        where: { id: activeFast.id },
        data: {
          endTime: stopTime,
          completed: isCompleted,
        },
      });

      return NextResponse.json(stoppedFast);
    }

    if (action === 'edit') {
      if (!id) {
        return NextResponse.json({ error: 'Missing fasting log id for edit action.' }, { status: 400 });
      }

      const existingFast = await prisma.fastingLog.findUnique({
        where: { id },
      });

      if (!existingFast) {
        return NextResponse.json({ error: 'Fasting log not found.' }, { status: 404 });
      }

      if (existingFast.userId !== userId) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }

      const updateData: {
        startTime?: Date;
        endTime?: Date | null;
        targetHours?: number;
        completed?: boolean;
      } = {};

      let finalStart = existingFast.startTime;
      let finalEnd = existingFast.endTime;
      let finalTarget = existingFast.targetHours;

      if (rawStartTime) {
        const parsedStart = new Date(rawStartTime);
        if (isNaN(parsedStart.getTime())) {
          return NextResponse.json({ error: 'Invalid startTime format.' }, { status: 400 });
        }
        updateData.startTime = parsedStart;
        finalStart = parsedStart;
      }

      if (rawEndTime !== undefined) {
        if (rawEndTime === null) {
          updateData.endTime = null;
          finalEnd = null;
        } else {
          const parsedEnd = new Date(rawEndTime);
          if (isNaN(parsedEnd.getTime())) {
            return NextResponse.json({ error: 'Invalid endTime format.' }, { status: 400 });
          }
          updateData.endTime = parsedEnd;
          finalEnd = parsedEnd;
        }
      }

      if (targetHours !== undefined) {
        if (typeof targetHours !== 'number' || targetHours <= 0 || targetHours > 168) {
          return NextResponse.json({ error: 'targetHours must be between 1 and 168.' }, { status: 400 });
        }
        updateData.targetHours = targetHours;
        finalTarget = targetHours;
      }

      // Check chronologic logic if fast is ended
      if (finalEnd) {
        if (finalEnd < finalStart) {
          return NextResponse.json({ error: 'End time cannot be earlier than start time.' }, { status: 400 });
        }
        const elapsedHours = (finalEnd.getTime() - finalStart.getTime()) / (1000 * 60 * 60);
        updateData.completed = elapsedHours >= finalTarget;
      } else {
        updateData.completed = false;
      }

      const updatedFast = await prisma.fastingLog.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json(updatedFast);
    }

    return NextResponse.json({ error: 'Invalid action. Supported: stop, edit.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[PATCH /api/fasting error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while modifying the fast.' },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/fasting                                              */
/*  Deletes a specific fasting log.                                  */
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

    const existing = await prisma.fastingLog.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Fasting log not found.' }, { status: 404 });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    await prisma.fastingLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /api/fasting error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting the fasting log.' },
      { status: 500 },
    );
  }
}
