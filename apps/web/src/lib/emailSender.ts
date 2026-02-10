type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Starbeam <onboarding@resend.dev>";

  // Preferred path (most flexible): SMTP. Works with AWS SES SMTP, Postmark SMTP, Mailjet, etc.
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const nodemailer = await import("nodemailer");

    const port = Number(process.env.SMTP_PORT ?? "587") || 587;
    const secure = String(process.env.SMTP_SECURE ?? "").toLowerCase();
    const useSecure =
      secure === "1" ||
      secure === "true" ||
      (port === 465 && secure !== "false");

    const user = process.env.SMTP_USER ?? "";
    const pass = process.env.SMTP_PASS ?? "";

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: useSecure,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });

    return;
  }

  // Fallback: Resend API.
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev fallback: avoid silently "succeeding" without a provider.
    // In production we expect RESEND_API_KEY to be set.
    console.warn("[email] RESEND_API_KEY missing; not sending email:", {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const resp = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  });

  if ((resp as { error?: unknown }).error) {
    const err = (resp as { error?: unknown }).error;
    throw new Error(`Email send failed: ${JSON.stringify(err)}`);
  }
}
