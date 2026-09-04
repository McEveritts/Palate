import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { linkGoogleAccount, AccountLinkError } from "@/lib/googleAccountService";
import {
  OAUTH_STATE_COOKIE_NAME,
  validateReturnedOAuthState,
  clearOAuthStateCookie,
} from "@/lib/oauthState";

export const dynamic = "force-dynamic";

/**
 * Best-effort token revocation to prevent orphaned grants when callback fails post-exchange.
 */
async function bestEffortRevoke(token?: string | null): Promise<void> {
  if (!token) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Best-effort; ignore errors
  }
}

function redirectWithError(url: URL, errCode: string): NextResponse {
  url.searchParams.set("error", errCode);
  const res = NextResponse.redirect(url);
  clearOAuthStateCookie(res);
  return res;
}

/**
 * Handles the Google Calendar OAuth 2.0 PKCE callback.
 * Validates state, active session, code verifier, and binds encrypted tokens
 * strictly to the currently authenticated Jellyfin user with atomic ownership guarantees.
 */
export async function GET(req: NextRequest) {
  const appBaseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const settingsUrl = new URL("/settings", appBaseUrl);

  // 1. Validate active Jellyfin session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.jellyfinAuthenticated) {
    return redirectWithError(settingsUrl, "session_required");
  }

  // 2. Check for incoming OAuth errors from Google (e.g. user consent denied)
  const errorParam = req.nextUrl.searchParams.get("error");
  if (errorParam) {
    const stateParam = req.nextUrl.searchParams.get("state");
    const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
    // Validate returned state on error and honor state validation results
    const stateValidation = validateReturnedOAuthState(stateCookie, stateParam, session.user.id);
    if (!stateValidation.success) {
      const reasonMap: Record<string, string> = {
        missing: "missing_oauth_state",
        malformed: "invalid_oauth_state",
        expired: "expired_oauth_state",
        user_mismatch: "user_mismatch",
        state_mismatch: "state_mismatch",
      };
      return redirectWithError(settingsUrl, reasonMap[stateValidation.reason] || "invalid_oauth_state");
    }
    return redirectWithError(settingsUrl, errorParam);
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");

  if (!code || !stateParam) {
    return redirectWithError(settingsUrl, "missing_callback_params");
  }

  // 3. Read, decrypt, and validate state cookie with runtime schema
  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const stateValidation = validateReturnedOAuthState(stateCookie, stateParam, session.user.id);
  if (!stateValidation.success) {
    const reasonMap: Record<string, string> = {
      missing: "missing_oauth_state",
      malformed: "invalid_oauth_state",
      expired: "expired_oauth_state",
      user_mismatch: "user_mismatch",
      state_mismatch: "state_mismatch",
    };
    return redirectWithError(settingsUrl, reasonMap[stateValidation.reason] || "invalid_oauth_state");
  }

  const storedState = stateValidation.payload;

  // 4. Exchange authorization code for tokens using PKCE verifier
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = new URL("/api/integrations/google-calendar/callback", appBaseUrl).toString();

  if (!clientId || !clientSecret) {
    return redirectWithError(settingsUrl, "google_not_configured");
  }

  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: storedState.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!tokenRes.ok) {
      console.error("[GoogleCalendar] Token exchange failed with status:", tokenRes.status);
      return redirectWithError(settingsUrl, "token_exchange_failed");
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error("[GoogleCalendar] Network error during token exchange:", err);
    return redirectWithError(settingsUrl, "token_exchange_network_error");
  }

  // 5. Verify granted scopes include Calendar
  const grantedScopes = (tokenData.scope || "").split(/\s+/);
  if (!grantedScopes.includes("https://www.googleapis.com/auth/calendar")) {
    console.warn("[GoogleCalendar] Granted scope missing calendar access:", tokenData.scope);
    await bestEffortRevoke(tokenData.access_token);
    return redirectWithError(settingsUrl, "insufficient_calendar_scope");
  }

  // 6. Resolve durable Google Account Subject ID (sub) from userinfo endpoint
  let googleSub: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const userinfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (userinfoRes.ok) {
      const userinfo = await userinfoRes.json();
      googleSub = typeof userinfo.sub === "string" ? userinfo.sub : null;
    }
  } catch (err) {
    console.warn("[GoogleCalendar] Error querying userinfo endpoint:", err);
  }

  // Fail closed: if authenticated userinfo cannot resolve sub, refuse to connect
  if (!googleSub) {
    await bestEffortRevoke(tokenData.access_token);
    return redirectWithError(settingsUrl, "failed_resolving_google_identity");
  }

  // 7. Atomic Account linking & one-Google-connection invariant via shared production service
  try {
    await linkGoogleAccount({
      userId: session.user.id,
      googleSub,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    });
  } catch (err: unknown) {
    await bestEffortRevoke(tokenData.access_token);
    if (tokenData.refresh_token) {
      await bestEffortRevoke(tokenData.refresh_token);
    }

    if (err instanceof AccountLinkError) {
      return redirectWithError(settingsUrl, err.code);
    }
    console.error("[GoogleCalendar] Database transaction error during account link:", err);
    return redirectWithError(settingsUrl, "connection_failed");
  }

  // 8. Clear state cookie and redirect to settings with success status
  settingsUrl.searchParams.set("connected", "google_calendar");
  const response = NextResponse.redirect(settingsUrl);
  clearOAuthStateCookie(response);
  return response;
}
