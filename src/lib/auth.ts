import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { isJellyfinEnabled, authenticateWithJellyfin } from "@/lib/jellyfin";
import { ensureUserProvisioned } from "@/lib/provisioning";
import { checkAuthRateLimit, computeRateLimitKey } from "@/lib/rateLimit";

export { checkAuthRateLimit, computeRateLimitKey };

if (!process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("FATAL: NEXTAUTH_SECRET must be set in the environment.");
  }
  console.warn("Warning: NEXTAUTH_SECRET is not defined. Authentication might fail in production.");
}


export async function authorizeJellyfin(
  credentials: Record<string, string> | undefined,
  req?: unknown
): Promise<{ id: string; name: string | null; email: string | null } | null> {
  if (!credentials?.username || typeof credentials.password !== "string") {
    return null;
  }

  const reqObj = req as { headers?: Record<string, string | string[] | undefined> } | undefined;
  const reqHeaders = reqObj?.headers;
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
jellyfinProvider.id = "jellyfin";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  get providers() {
    const list: NextAuthOptions["providers"] = [];
    if (isJellyfinEnabled()) {
      list.push(jellyfinProvider);
    }
    return list;
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.authProvider = "jellyfin";
        token.jellyfinAuthenticated = true;
        await ensureUserProvisioned(user.id, user.name);
      }
      return token;
    },
    async session({ session, token }) {
      // Invariant: Jellyfin is the exclusive login provider.
      // Reject legacy tokens lacking the Jellyfin authentication marker!
      if (!token.jellyfinAuthenticated || token.authProvider !== "jellyfin") {
        return {
          ...session,
          user: undefined,
          authProvider: null,
          jellyfinAuthenticated: false,
        } as unknown as typeof session;
      }

      if (session.user) {
        session.user.id = token.id as string;
      }
      session.authProvider = "jellyfin";
      session.jellyfinAuthenticated = true;
      return session;
    },
  },
};
