/**
 * Jellyfin Authentication Client for Palate
 *
 * Interacts with Jellyfin's server API to verify credentials using modern authorization headers.
 * Never stores passwords, scrubs tokens, and enforces short bounded timeouts.
 */

import { APP_VERSION } from "@/lib/version";

export const JELLYFIN_CLIENT_HEADER = `MediaBrowser Client="Palate", Device="Palate Web", DeviceId="palate-web", Version="${APP_VERSION}"`;
const AUTH_TIMEOUT_MS = 6000;
const LOGOUT_TIMEOUT_MS = 2000;

export interface JellyfinAuthResult {
  jellyfinUserId: string;
  jellyfinServerId: string;
  jellyfinUsername: string;
}

export type JellyfinAuthErrorCode = "InvalidCredentials" | "AccountDisabled" | "JellyfinUnavailable";

export type JellyfinAuthResponse =
  | { success: true; data: JellyfinAuthResult }
  | { success: false; error: JellyfinAuthErrorCode };

/**
 * Checks if Jellyfin authentication is enabled and properly configured.
 * Default is strictly OFF unless JELLYFIN_LOGIN_ENABLED === "true" and a valid HTTP(S) URL is provided.
 */
export function isJellyfinEnabled(): boolean {
  if (process.env.JELLYFIN_LOGIN_ENABLED !== "true") {
    return false;
  }
  const url = getJellyfinBaseUrl();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves the configured base URL for Jellyfin (prefers internal container URL).
 */
export function getJellyfinBaseUrl(): string {
  const url = (process.env.JELLYFIN_INTERNAL_URL || process.env.JELLYFIN_URL || "").trim();
  return url.replace(/\/+$/, "");
}

/**
 * Performs a best-effort, non-blocking session logout on the Jellyfin server.
 * Uses modern Authorization header with Token="<accessToken>".
 */
async function logoutJellyfinSession(baseUrl: string, accessToken: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/Sessions/Logout`, {
      method: "POST",
      headers: {
        "Authorization": `${JELLYFIN_CLIENT_HEADER}, Token="${accessToken}"`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[Jellyfin] Session logout returned status ${response.status} (non-fatal)`);
    }
  } catch (error: unknown) {
    // Log as warning only; cleanup failure must not fail authentication
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Jellyfin] Session logout failed: ${message} (non-fatal)`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Authenticates a user against the Jellyfin server using POST /Users/AuthenticateByName.
 *
 * Returns normalized Jellyfin identity details on success, or structured error code on failure.
 * Always logs out temporary Jellyfin sessions in a finally block, including for disabled accounts.
 */
export async function authenticateWithJellyfin(
  username: string,
  password: string
): Promise<JellyfinAuthResponse> {
  if (!isJellyfinEnabled()) {
    return { success: false, error: "InvalidCredentials" };
  }

  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    return { success: false, error: "InvalidCredentials" };
  }

  const baseUrl = getJellyfinBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  let accessToken: string | null = null;

  try {
    const response = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": JELLYFIN_CLIENT_HEADER,
      },
      body: JSON.stringify({
        Username: trimmedUsername,
        Pw: password,
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 400) {
      return { success: false, error: "InvalidCredentials" };
    }

    if (!response.ok) {
      console.error(`[Jellyfin] Upstream server returned unexpected status ${response.status}`);
      return { success: false, error: "JellyfinUnavailable" };
    }

    const data = await response.json();

    // Capture access token IMMEDIATELY so it is guaranteed to be cleaned up in finally
    accessToken = data?.AccessToken || null;

    if (!data?.User?.Id || !data?.ServerId) {
      console.error("[Jellyfin] Response missing User.Id or ServerId");
      return { success: false, error: "InvalidCredentials" };
    }

    // Verify account is not disabled (token is already captured and will be logged out in finally)
    if (data.User.Policy?.IsDisabled) {
      console.warn(`[Jellyfin] Account disabled for user: ${trimmedUsername}`);
      return { success: false, error: "AccountDisabled" };
    }

    return {
      success: true,
      data: {
        jellyfinUserId: data.User.Id,
        jellyfinServerId: data.ServerId,
        jellyfinUsername: data.User.Name || trimmedUsername,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Jellyfin] Authentication request failed: ${message}`);
    return { success: false, error: "JellyfinUnavailable" };
  } finally {
    clearTimeout(timeoutId);
    if (accessToken) {
      // Best-effort cleanup of temporary Jellyfin device session (including for disabled accounts)
      await logoutJellyfinSession(baseUrl, accessToken);
    }
  }
}
