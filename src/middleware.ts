import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { isValidCronAuth } from "@/lib/cronAuth";

// Best-effort process-local defense-in-depth rate limiting for Edge middleware.
// Persistent PostgreSQL rate limiting is implemented at the Jellyfin credential login layer.
export interface RateLimitBucket {
  timestamps: number[];
}

export const apiRateLimitMap = new Map<string, RateLimitBucket>();
export const API_RATE_LIMIT = 20;
export const API_WINDOW_MS = 60 * 1000;
export const MAX_MAP_ENTRIES = 2000;

export function checkApiRateLimit(identifier: string): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const windowStart = now - API_WINDOW_MS;

  let bucket = apiRateLimitMap.get(identifier);
  if (!bucket) {
    // O(1) LRU eviction if map reaches max capacity to avoid unbounded growth or DoS
    if (apiRateLimitMap.size >= MAX_MAP_ENTRIES) {
      const oldestKey = apiRateLimitMap.keys().next().value;
      if (oldestKey !== undefined) {
        apiRateLimitMap.delete(oldestKey);
      }
    }
    bucket = { timestamps: [] };
    apiRateLimitMap.set(identifier, bucket);
  } else {
    // Refresh key order for LRU tracking in Map
    apiRateLimitMap.delete(identifier);
    apiRateLimitMap.set(identifier, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= API_RATE_LIMIT) {
    const oldestTimestamp = bucket.timestamps[0];
    const resetTime = Math.ceil((oldestTimestamp + API_WINDOW_MS) / 1000);
    return {
      success: false,
      limit: API_RATE_LIMIT,
      remaining: 0,
      reset: resetTime,
    };
  }

  bucket.timestamps.push(now);
  const resetTime = Math.ceil((now + API_WINDOW_MS) / 1000);
  return {
    success: true,
    limit: API_RATE_LIMIT,
    remaining: API_RATE_LIMIT - bucket.timestamps.length,
    reset: resetTime,
  };
}

export async function handleMiddleware(req: NextRequestWithAuth) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

    if (isApiRoute) {
      if (pathname === "/api/curate") {
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;
        if (!isValidCronAuth(authHeader, cronSecret)) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Valid cron authentication: proceed without CSRF Origin check
      } else if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        // 1. M5 Fix: CSRF Protection — validate Origin on mutating requests
        const origin = req.headers.get("origin");
        const host = req.headers.get("host");

        // H-9 Fix: Reject mutating requests that lack an Origin header
        if (!origin) {
          return NextResponse.json(
            { error: "CSRF Blocked: Missing Origin header." },
            { status: 403 }
          );
        }

        if (host) {
          try {
            const originUrl = new URL(origin);
            if (originUrl.host !== host) {
              return NextResponse.json(
                { error: "CSRF Blocked: Invalid Origin." },
                { status: 403 }
              );
            }
          } catch {
            return NextResponse.json(
              { error: "CSRF Blocked: Malformed Origin." },
              { status: 403 }
            );
          }
        }
      }

      // 2. H4 Fix: Application-Wide Rate Limiting (20 req/min per user or per IP)
      const identifier =
        req.nextauth?.token?.sub ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "anonymous";

      const { success, limit, reset, remaining } = checkApiRateLimit(identifier);

      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": remaining.toString(),
              "X-RateLimit-Reset": reset.toString(),
            },
          }
        );
      }
    }

    return NextResponse.next();
}

export default withAuth(
  handleMiddleware,
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Enforce Jellyfin-exclusive session provenance.
        // Legacy tokens lacking the Jellyfin marker are treated as unauthenticated.
        const isJellyfinAuth = !!token && token.jellyfinAuthenticated === true;

        // C-1 Fix: API routes ALWAYS require a real auth token.
        // Guest cookie only allows access to page routes.
        const { pathname } = req.nextUrl;
        const isApiRoute = pathname.startsWith('/api/');
        if (isApiRoute) {
          // Allow access to /api/curate to be handled directly by middleware function
          if (pathname === '/api/curate') {
            return true;
          }
          // Allow guest access to Sage AI API routes ONLY if they provide their own API key
          if (pathname.startsWith('/api/sage')) {
            const isGuest = req.cookies.get("palate_guest")?.value === "true";
            const hasApiKey = !!req.headers.get("x-gemini-api-key");
            return isJellyfinAuth || (isGuest && hasApiKey);
          }
          return isJellyfinAuth;
        }
        const isGuest = req.cookies.get("palate_guest")?.value === "true";
        return isJellyfinAuth || isGuest;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/ask_sage",
    "/plans/:path*",
    "/vault/:path*",
    "/collections/:path*",
    "/upload/:path*",
    "/settings",
    "/calendar",
    "/api/((?!auth).*)",
  ],
};
