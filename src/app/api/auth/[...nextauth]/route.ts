import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";

if (!process.env.NEXTAUTH_SECRET) {
  console.warn("Warning: NEXTAUTH_SECRET is not defined. Authentication might fail in production.");
}

// L2 Fix: Fail-secure on missing OAuth credentials
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("FATAL: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in the environment.");
  }
  console.warn("Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not defined. OAuth login will fail.");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        }
      }
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        // Ensure default UserConfig exists for this user
        try {
          const config = await prisma.userConfig.findUnique({
            where: { userId: user.id }
          });
          if (!config) {
            await prisma.userConfig.create({
              data: {
                userId: user.id,
                metricSystem: true
              }
            });
          }
        } catch (error) {
          console.error("Failed to create default UserConfig:", error);
        }

        // Ensure user belongs to a Household (auto-create solo household if needed)
        try {
          const existingUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { householdId: true, name: true },
          });
          if (existingUser && !existingUser.householdId) {
            await prisma.household.create({
              data: {
                name: `${existingUser.name ?? "My"}'s Kitchen`,
                members: { connect: { id: user.id } },
              },
            });
          }
        } catch (error) {
          console.error("Failed to create default Household:", error);
        }
      }
      
      // Catch and persist refreshed Google OAuth tokens
      if (account && account.provider === 'google') {
        try {
          await prisma.account.updateMany({
            where: {
              provider: 'google',
              providerAccountId: account.providerAccountId,
            },
            data: {
              access_token: account.access_token,
              expires_at: account.expires_at,
              scope: account.scope,
              // Only overwrite refresh_token if Google actually provided a new one
              ...(account.refresh_token && { refresh_token: account.refresh_token }),
            },
          });
        } catch (error) {
          console.error("[NextAuth] Failed to sync Google OAuth tokens to db:", error);
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

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
