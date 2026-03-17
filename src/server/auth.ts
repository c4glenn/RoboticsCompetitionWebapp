import NextAuth, { DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

// Augment the session type to include user.id and isDevice
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isDevice?: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // Credentials provider requires JWT strategy
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.query.users.findFirst({
          where: eq(schema.users.email, credentials.email as string),
        });

        if (!user?.passwordHash) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
    Credentials({
      id: "device",
      credentials: { token: {} },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const user = await db.query.users.findFirst({
          where: eq(schema.users.deviceToken, credentials.token as string),
        });

        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? null,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (user && !user.email) (token as Record<string, unknown>).isDevice = true;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if ((token as Record<string, unknown>).isDevice) session.user.isDevice = true;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
