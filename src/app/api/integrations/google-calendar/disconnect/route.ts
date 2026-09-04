import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/tokenEncryption";

export const dynamic = "force-dynamic";

/**
 * Disconnects Google Calendar integration for the current Jellyfin user.
 * Revokes tokens upstream at Google, deletes database Account records,
 * and resets calendar synchronization preferences.
 *
 * Resilience invariants:
 * - Handles every Google Account row for this user (including legacy multi-account records).
 * - Never traps the user if tokens cannot be decrypted or Google is unavailable.
 * - Always deletes local records and disables sync.
 * - Returns revocationWarning if upstream revocation could not be verified.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.jellyfinAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let hasRevocationWarning = false;

  try {
    const accounts = await prisma.account.findMany({
      where: { userId, provider: "google" },
    });

    for (const account of accounts) {
      const tokensToRevoke: string[] = [];

      // Safely attempt decryption without throwing/trapping user
      for (const raw of [account.refresh_token, account.access_token]) {
        if (!raw) continue;
        try {
          const decrypted = decryptToken(raw);
          if (decrypted) {
            tokensToRevoke.push(decrypted);
          }
        } catch {
          // Token decryption failed (corrupt or unreadable)
          hasRevocationWarning = true;
        }
      }

      if (tokensToRevoke.length === 0 && (account.refresh_token || account.access_token)) {
        hasRevocationWarning = true;
      }

      for (const token of tokensToRevoke) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const response = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ token }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!response.ok) {
            console.warn(`[GoogleCalendar] Upstream revocation returned status: ${response.status}`);
            hasRevocationWarning = true;
          }
        } catch (revokeErr) {
          console.warn("[GoogleCalendar] Network error during token revocation:", revokeErr);
          hasRevocationWarning = true;
        }
      }
    }

    // Always delete local Account records for Google and reset UserConfig atomically in one transaction
    await prisma.$transaction(async (tx) => {
      await tx.account.deleteMany({
        where: { userId, provider: "google" },
      });

      await tx.userConfig.updateMany({
        where: { userId },
        data: {
          googleCalendarSyncEnabled: false,
          googleCalendarId: null,
        },
      });
    });

    const payload: { success: boolean; disconnected: boolean; revocationWarning?: string } = {
      success: true,
      disconnected: true,
    };

    if (hasRevocationWarning) {
      payload.revocationWarning =
        "Google Calendar was disconnected locally, but upstream grant revocation could not be confirmed. You can review and revoke permissions directly in your Google Account security settings (https://myaccount.google.com/permissions).";
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GoogleCalendar] Error during integration disconnect:", error);
    return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 });
  }
}
