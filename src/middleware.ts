import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// H4 Fix: Upstash Redis rate limiter (safe fallback if not configured)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// 20 requests per minute sliding window per user/IP
const ratelimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 m") })
  : null;

export default withAuth(
  async function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl;

    // Redirect root to /ask_sage
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/ask_sage", req.url));
    }

    const isApiRoute = pathname.startsWith("/api/");

    if (isApiRoute) {
      // 1. M5 Fix: CSRF Protection — validate Origin on mutating requests
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("host");

        if (origin && host) {
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

      // 2. H4 Fix: Rate Limiting (per-user or per-IP)
      if (ratelimit) {
        const identifier =
          req.nextauth?.token?.sub ||
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "anonymous";

        const { success, limit, reset, remaining } = await ratelimit.limit(
          `rl_${identifier}`
        );

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
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Require authentication for all protected routes.
        // Unauthenticated users will be automatically redirected to /login.
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/",
    "/ask_sage",
    "/plans/:path*",
    "/vault/:path*",
    "/collections/:path*",
    "/upload/:path*",
    "/settings",
    "/api/((?!auth).*)",
  ],
};
