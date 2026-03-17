import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

// Use only the edge-compatible config — no DB or Node.js-only imports here.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
