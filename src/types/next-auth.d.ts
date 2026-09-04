import "next-auth";
import { DefaultSession } from "next-auth";
import "next-auth/jwt";

/**
 * Extend NextAuth's Session and JWT types to include user.id and Jellyfin session provenance markers.
 */
declare module "next-auth" {
  interface Session {
    authProvider?: "jellyfin" | null;
    jellyfinAuthenticated?: boolean;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    authProvider?: string;
    jellyfinAuthenticated?: boolean;
  }
}
