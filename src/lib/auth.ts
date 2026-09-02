import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { isJellyfinEnabled, authenticateWithJellyfin } from "@/lib/jellyfin";
import { ensureUserProvisioned } from "@/lib/provisioning";
import { checkAuthRateLimit, computeRateLimitKey } from "@/lib/rateLimit";

export { checkAuthRateLimit, computeRateLimitKey };

if (!process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: NEXTAUTH_SECRET must be set in the environment.");
  }
  console.warn("Warning: NEXTAUTH_SECRET is not defined. Authentication might fail in production.");
}

// L2 Fix: Fail-secure on missing OAuth credentials
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in the environment.");
  }
  console.warn("Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not defined. OAuth login will fail.");
}


export async function authorizeJellyfin(
  credentials: Record<string, string> | undefined,
  req: any
): Promise<{ id: string; name: string | null; email: string | null } | null> {
  if (!credentials?.username || typeof credentials.password !== "string") {
    return null;
  }

  const reqHeaders = req?.headers as Record<string, string | string[] | undefined> | undefined;
  const xForwardedFor = reqHeaders?.["x-forwarded-for"];
  const ip = (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor)?.split(",")[0].trim() ||
    (reqHeaders?.["x-real-ip"] as string) ||
    "unknown-ip";

  const allowed = await checkAuthRateLimit(ip, credentials.username);
  if (!allowed) {
    console.warn(`[Auth] Rate limit triggered for Jellyfin login attempt from ${ip}`);
    throw new Error("RateLimited");
  }

  const authResult = await authenticateWithJellyfin(credentials.username, credentials.password);
  if (!authResult.success) {
    if (authResult.error === "AccountDisabled") {
      throw new Error("AccountDisabled");
    }
    if (authResult.error === "JellyfinUnavailable") {
      throw new Error("JellyfinUnavailable");
    }
    return null; // NextAuth standard CredentialsSignin
  }

  const { jellyfinUserId, jellyfinServerId, jellyfinUsername } = authResult.data;

  try {
    // 1. Check if an identity link exists
    const existingIdentity = await prisma.jellyfinIdentity.findUnique({
      where: {
        jellyfinServerId_jellyfinUserId: {
          jellyfinServerId,
          jellyfinUserId,
        },
      },
      include: { user: true },
    });

    let userId: string;

    if (existingIdentity) {
      userId = existingIdentity.userId;
      // Update both JellyfinIdentity.jellyfinUsername and User.name
      await prisma.$transaction([
        prisma.jellyfinIdentity.update({
          where: { id: existingIdentity.id },
          data: {
            jellyfinUsername,
            lastAuthenticatedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            name: jellyfinUsername,
          },
        }),
      ]);
    } else {
      // First login: create User and JellyfinIdentity
      try {
        const newUser = await prisma.user.create({
          data: {
            name: jellyfinUsername,
            jellyfinIdentity: {
              create: {
                jellyfinUserId,
                jellyfinServerId,
                jellyfinUsername,
                lastAuthenticatedAt: new Date(),
              },
            },
          },
        });
        userId = newUser.id;
      } catch (err: unknown) {
        // Catch Prisma unique constraint violation (P2002) in case of concurrent first login
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          const winningIdentity = await prisma.jellyfinIdentity.findUnique({
            where: {
              jellyfinServerId_jellyfinUserId: {
                jellyfinServerId,
                jellyfinUserId,
              },
            },
            include: { user: true },
          });

          if (!winningIdentity) {
            console.error("[Auth] P2002 conflict encountered but winning identity was not found");
            throw new Error("JellyfinUnavailable");
          }

          userId = winningIdentity.userId;
          await prisma.$transaction([
            prisma.jellyfinIdentity.update({
              where: { id: winningIdentity.id },
              data: {
                jellyfinUsername,
                lastAuthenticatedAt: new Date(),
              },
            }),
            prisma.user.update({
              where: { id: userId },
              data: {
                name: jellyfinUsername,
              },
            }),
          ]);
        } else {
          console.error("[Auth] Database error during Jellyfin user creation:", err);
          throw new Error("JellyfinUnavailable");
        }
      }
    }

    // Idempotently ensure UserConfig & Household exist (transactional & concurrency-safe)
    await ensureUserProvisioned(userId, jellyfinUsername);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "RateLimited" || msg === "AccountDisabled" || msg === "JellyfinUnavailable") {
      throw error;
    }
    console.error("[Auth] Unexpected error during Jellyfin identity resolution:", error);
    throw new Error("JellyfinUnavailable");
  }
}

export const jellyfinProvider = CredentialsProvider({
  id: "jellyfin",
  name: "Jellyfin",
  credentials: {
    username: { label: "Username", type: "text" },
    password: { label: "Password", type: "password" },
  },
  authorize: authorizeJellyfin,
});

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    authorization: {
      params: {
        prompt: "consent",
        access_type: "offline",
        response_type: "code",
        scope: "openid email profile https://www.googleapis.com/auth/calendar",
      },
    },
  }),
];

if (isJellyfinEnabled()) {
  providers.push(jellyfinProvider);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        await ensureUserProvisioned(user.id, user.name);
      }

      if (account && user) {
        token.accessToken = account.access_token;
        token.id = user.id;

        // Persist updated Google OAuth credentials to the DB on sign in
        if (account.provider === "google") {
          try {
            await prisma.account.updateMany({
              where: {
                userId: user.id as string,
                provider: "google",
              },
              data: {
                access_token: account.access_token,
                // Only overwrite refresh_token if a new one is provided by Google
                ...(account.refresh_token && { refresh_token: account.refresh_token }),
                expires_at: account.expires_at,
                scope: account.scope,
              },
            });
          } catch (error) {
            console.error("Failed to update Google OAuth tokens in Account table:", error);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
