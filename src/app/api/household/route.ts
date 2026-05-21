import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { getHouseholdId, generateInviteCode } from "@/lib/household";

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
    const { action, code, name } = body;

    switch (action) {
      case "create-invite": {
        const householdId = await getHouseholdId(userId);
        const inviteCode = generateInviteCode();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

        await prisma.inviteCode.create({
          data: {
            code: inviteCode,
            householdId,
            createdBy: userId,
            expiresAt,
          },
        });

        return NextResponse.json({
          success: true,
          code: inviteCode,
          expiresAt: expiresAt.toISOString(),
        });
      }

      case "redeem-invite": {
        if (!code || typeof code !== "string" || code.length !== 8) {
          return NextResponse.json(
            { error: "Invalid invite code format." },
            { status: 400 }
          );
        }

        const invite = await prisma.inviteCode.findUnique({
          where: { code: code.toUpperCase() },
        });

        if (!invite) {
          return NextResponse.json(
            { error: "Invite code not found." },
            { status: 404 }
          );
        }

        if (invite.usedAt) {
          return NextResponse.json(
            { error: "This invite code has already been used." },
            { status: 400 }
          );
        }

        if (invite.expiresAt < new Date()) {
          return NextResponse.json(
            { error: "This invite code has expired." },
            { status: 400 }
          );
        }

        if (invite.createdBy === userId) {
          return NextResponse.json(
            { error: "You cannot redeem your own invite code." },
            { status: 400 }
          );
        }

        // Check if the user already belongs to this household
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { householdId: true },
        });

        if (user?.householdId === invite.householdId) {
          return NextResponse.json(
            { error: "You are already a member of this household." },
            { status: 400 }
          );
        }

        // Join the inviter's household
        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: { householdId: invite.householdId },
          }),
          prisma.inviteCode.update({
            where: { id: invite.id },
            data: { usedAt: new Date(), usedBy: userId },
          }),
        ]);

        return NextResponse.json({
          success: true,
          message: "Successfully joined the household!",
        });
      }

      case "leave": {
        const currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { householdId: true, name: true },
        });

        if (!currentUser?.householdId) {
          return NextResponse.json(
            { error: "You are not in a household." },
            { status: 400 }
          );
        }

        // Create a new solo household for the departing user
        const newHousehold = await prisma.household.create({
          data: {
            name: `${currentUser.name ?? "My"}'s Kitchen`,
            members: { connect: { id: userId } },
          },
        });

        return NextResponse.json({
          success: true,
          message: "You have left the household. A new personal kitchen has been created.",
          newHouseholdId: newHousehold.id,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
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
