import "server-only";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/tokenEncryption";
import type { PrismaClient } from "@prisma/client";

export class AccountLinkError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AccountLinkError";
  }
}

export interface LinkGoogleAccountParams {
  userId: string;
  googleSub: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface LinkGoogleAccountResult {
  success: boolean;
  action: "created" | "reconnected";
  accountId: string;
}

/**
 * Shared production service for linking a Google account to a Palate user.
 *
 * Invariants enforced at database and transaction level:
 * 1. Google providerAccountId (sub) ownership can NEVER transfer between Palate users.
 * 2. Exactly one Google connection per Palate user (@@unique([userId, provider])).
 * 3. Does NOT silently delete an existing different Google account; requires explicit disconnect first.
 * 4. Reconnecting the same Google account refreshes tokens without altering userId.
 * 5. Historical raw id_token values are never persisted.
 */
export async function linkGoogleAccount(
  params: LinkGoogleAccountParams,
  db: PrismaClient = prisma
): Promise<LinkGoogleAccountResult> {
  const { userId, googleSub, accessToken, refreshToken, expiresIn, tokenType, scope } = params;

  if (!userId || !googleSub || !accessToken) {
    throw new AccountLinkError("invalid_parameters", "Missing required parameters for Google account linking.");
  }

  const encAccessToken = encryptToken(accessToken);
  const encRefreshToken = refreshToken ? encryptToken(refreshToken) : undefined;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + (expiresIn || 3600);

  return await db.$transaction(async (tx) => {
    // 1. Check if this Google sub is already linked to ANY user
    const existingSubAccount = await tx.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleSub,
        },
      },
    });

    if (existingSubAccount && existingSubAccount.userId !== userId) {
      throw new AccountLinkError(
        "account_already_linked_to_another_user",
        "This Google account is already linked to a different Palate user."
      );
    }

    // 2. Check if this Palate user already has a connected Google account
    const existingUserAccount = await tx.account.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "google",
        },
      },
    });

    if (existingUserAccount && existingUserAccount.providerAccountId !== googleSub) {
      throw new AccountLinkError(
        "user_already_has_different_account",
        "A different Google account is already connected to your profile. Please disconnect it first before connecting a new one."
      );
    }

    // 3. Reconnection case: same user and same Google sub
    if (existingUserAccount && existingUserAccount.providerAccountId === googleSub) {
      const updated = await tx.account.update({
        where: { id: existingUserAccount.id },
        data: {
          access_token: encAccessToken,
          refresh_token: encRefreshToken ?? existingUserAccount.refresh_token,
          expires_at: expiresAtSeconds,
          token_type: tokenType ?? existingUserAccount.token_type,
          scope: scope ?? existingUserAccount.scope,
          id_token: null, // Scrub raw identity tokens
        },
      });

      return {
        success: true,
        action: "reconnected" as const,
        accountId: updated.id,
      };
    }

    // 4. New connection case
    try {
      const created = await tx.account.create({
        data: {
          userId,
          type: "oauth",
          provider: "google",
          providerAccountId: googleSub,
          access_token: encAccessToken,
          refresh_token: encRefreshToken,
          expires_at: expiresAtSeconds,
          token_type: tokenType,
          scope,
          id_token: null,
        },
      });

      // Ensure UserConfig exists with default-off sync
      await tx.userConfig.upsert({
        where: { userId },
        create: {
          userId,
          googleCalendarSyncEnabled: false, // Invariant: Calendar sync defaults OFF
        },
        update: {
          // Do not toggle existing sync setting on reconnect
        },
      });

      return {
        success: true,
        action: "created" as const,
        accountId: created.id,
      };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        const errStr = JSON.stringify(err).toLowerCase();

        if (errStr.includes("provideraccountid") || errStr.includes("provider_account_id")) {
          throw new AccountLinkError(
            "account_already_linked_to_another_user",
            "This Google account is already linked to another user."
          );
        }
        if (errStr.includes("userid") || errStr.includes("user_id")) {
          throw new AccountLinkError(
            "user_already_has_different_account",
            "A Google account is already connected to this user."
          );
        }
        throw new AccountLinkError("account_conflict", "Database unique constraint conflict during account linking.");
      }
      throw err;
    }
  });
}
