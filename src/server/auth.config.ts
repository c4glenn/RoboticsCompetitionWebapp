import type { NextAuthConfig } from "next-auth";

const protectedPrefixes = ["/dashboard", "/referee", "/judge", "/inspect"];

/**
 * Edge-compatible Auth.js config — no Node.js-only imports (no DB, no bcrypt).
 * Used exclusively by middleware. The full config (with DrizzleAdapter +
 * Credentials provider) lives in auth.ts.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      const isProtected = protectedPrefixes.some((p) =>
        pathname.startsWith(p)
      );
      const isAuthPage = pathname === "/login" || pathname === "/register";

      if (isProtected && !isLoggedIn) {
        // Auth.js will redirect to signIn page with callbackUrl automatically
        return false;
      }

      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
  providers: [],
};
