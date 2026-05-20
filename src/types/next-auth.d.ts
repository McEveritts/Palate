import "next-auth";
import { DefaultSession } from "next-auth";

/**
 * L1 Fix: Extend NextAuth's Session type to include user.id.
 * Eliminates the unsafe `(session.user as any).id` pattern throughout the codebase.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
