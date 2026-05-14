import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/ask_sage", req.url));
    }
    
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
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
    "/upload/:path*"
  ],
};
