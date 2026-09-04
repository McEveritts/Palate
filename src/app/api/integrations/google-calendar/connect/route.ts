import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setOAuthStateCookie, OAuthStatePayload } from "@/lib/oauthState";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Initiates the Google Calendar OAuth 2.0 PKCE flow.
 * Requires an active Jellyfin-authenticated Palate session.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.jellyfinAuthenticated) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", "/settings");
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[GoogleCalendar] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
    const settingsUrl = new URL("/settings", req.nextUrl.origin);
    settingsUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  // 1. Generate cryptographically random state & PKCE pair
  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  // 2. Determine redirect URI
  const appBaseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const redirectUri = new URL("/api/integrations/google-calendar/callback", appBaseUrl).toString();

  // 3. Package state payload
  const statePayload: OAuthStatePayload = {
    state,
    codeVerifier,
    userId: session.user.id,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  // 4. Construct Google OAuth 2.0 authorization URL with minimized scopes (calendar + openid only)
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/calendar openid"
  );
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("code_challenge", codeChallenge);
  googleAuthUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(googleAuthUrl);

  // 5. Attach secure encrypted HttpOnly cookie
  setOAuthStateCookie(response, statePayload);

  return response;
}
