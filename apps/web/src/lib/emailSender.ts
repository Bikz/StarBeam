type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

type EmailSendTelemetry = {
  provider: "smtp" | "resend";
  toDomain: string | null;
  subjectLength: number;
  textLength: number;
  containsOtpLikeCode: boolean;
};

function recipientDomain(email: string): string | null {
  const raw = email.trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at >= raw.length - 1) return null;
  return raw.slice(at + 1);
}

function containsOtpLikeCode(text: string): boolean {
  return /\b\d{6,8}\b/.test(text);
}

function buildSafeTelemetry(
  provider: EmailSendTelemetry["provider"],
  payload: EmailPayload,
): EmailSendTelemetry {
  return {
    provider,
    toDomain: recipientDomain(payload.to),
    subjectLength: payload.subject.length,
    textLength: payload.text.length,
    containsOtpLikeCode: containsOtpLikeCode(payload.text),
  };
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Starbeam <onboarding@resend.dev>";
  const body = payload.text;

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
      text: body,
    });

    return;
  }

  // Fallback: Resend API.
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev fallback: avoid silently "succeeding" without a provider.
    // In production we expect RESEND_API_KEY to be set.
    console.warn(
      "[email] RESEND_API_KEY missing; not sending email",
      buildSafeTelemetry("resend", payload),
    );
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const resp = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    text: body,
  });

  if ((resp as { error?: unknown }).error) {
    const err = (resp as { error?: unknown }).error;
    throw new Error(`Email send failed: ${JSON.stringify(err)}`);
  }
}
