import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/household";
import {
  createHouseholdInvite,
  redeemHouseholdInvite,
  removeHouseholdMember,
  leaveHousehold,
  HouseholdServiceError,
} from "@/lib/householdService";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const householdId = await getHouseholdId(userId);

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          select: { id: true, name: true, email: true, image: true },
        },
        inviteCodes: {
          where: {
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { code: true, expiresAt: true },
        },
      },
    });

    if (!household) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      household: {
        id: household.id,
        name: household.name,
        members: household.members,
        pendingInvites: household.inviteCodes,
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/household error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { action, code } = body;

    switch (action) {
      case "create-invite": {
        const result = await createHouseholdInvite(userId);
        return NextResponse.json(result);
      }

      case "redeem-invite": {
        const result = await redeemHouseholdInvite(userId, code);
        return NextResponse.json(result);
      }

      case "remove-member": {
        const { memberId } = body;
        const result = await removeHouseholdMember(userId, memberId);
        return NextResponse.json(result);
      }

      case "leave": {
        const result = await leaveHousehold(userId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    if (error instanceof HouseholdServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[POST /api/household error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { name } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json(
        { error: "Household name must be 1-100 characters." },
        { status: 400 }
      );
    }

    const householdId = await getHouseholdId(userId);

    await prisma.household.update({
      where: { id: householdId },
      data: { name: name.trim() },
    });

    return NextResponse.json({ success: true, name: name.trim() });
  } catch (error: unknown) {
    console.error("[PATCH /api/household error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
