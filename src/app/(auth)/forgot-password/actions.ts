"use server";

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { sendEmail } from "@/lib/email";

export type ForgotPasswordResult = { success: true } | { success: false; error: string };

export async function requestPasswordReset(email: string): Promise<ForgotPasswordResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // Only send if user exists and uses credentials (has a password)
  if (user?.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Remove any existing reset tokens for this email
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, email));

    await db.insert(verificationTokens).values({ identifier: email, token, expires });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    await sendEmail({
      to: email,
      toName: user.name ?? undefined,
      subject: "Reset your password",
      text: `Hi${user.name ? ` ${user.name}` : ""},\n\nClick the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    });
  }

  // Always return success to avoid leaking whether the email exists
  return { success: true };
}
