import { BrevoClient } from "@getbrevo/brevo";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  text: string;
}

function getClient(): BrevoClient {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY environment variable is not set");
  return new BrevoClient({ apiKey });
}

export async function sendEmail({ to, toName, subject, text }: SendEmailOptions): Promise<void> {
  const client = getClient();
  await client.transactionalEmails.sendTransacEmail({
    sender: {
      email: process.env.EMAIL_FROM ?? "noreply@example.com",
      name: process.env.EMAIL_FROM_NAME ?? "Robotics Competition",
    },
    to: [{ email: to, name: toName }],
    subject,
    textContent: text,
  });
}
