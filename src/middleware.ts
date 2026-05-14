import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // If there is a token, the user is authenticated
        if (token) return true;
        // Otherwise, they must be redirected to /login
        return false;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/plans/:path*",
    "/vault/:path*",
    "/collections/:path*",
    "/upload/:path*",
    "/settings/:path*"
  ],
};