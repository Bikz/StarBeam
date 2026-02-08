"use client";

import { useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

type Step = "email" | "code";

export default function EmailCodeSignIn({
  callbackUrl = "/beta",
  initialReferralCode = "",
}: {
  callbackUrl?: string;
  initialReferralCode?: string;
}) {
  const { status } = useSession();
  const disabled = status === "loading";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [ref, setRef] = useState(() => initialReferralCode.trim());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const emailValue = useMemo(() => normalizeEmail(email), [email]);

  async function requestCode() {
    setError(null);
    if (!emailValue) {
      setError("Enter your email.");
      return;
    }

    setBusy(true);
    try {
      await fetch("/api/auth/email/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, ...(ref.trim() ? { ref: ref.trim() } : {}) }),
      });
      setSentAt(Date.now());
      setStep("code");
    } catch {
      setError("Could not send a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError(null);
    const normalized = code.trim();
    if (!/^[0-9]{6}$/.test(normalized)) {
      setError("Enter the 6-digit code.");
      return;
    }

    setBusy(true);
    try {
      const resp = await signIn("credentials", {
        email: emailValue,
        code: normalized,
        callbackUrl,
        redirect: true,
      });

      if (resp?.error) setError("Invalid code. Try again.");
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const sentHint =
    step === "code" && sentAt
      ? `Code sent to ${emailValue || "your email"}.`
      : "We’ll email you a 6-digit code.";

  return (
    <div className="grid gap-4">
      <div className="text-sm text-[color:var(--sb-muted)] leading-relaxed">
        {sentHint}
      </div>

      {step === "email" ? (
        <div className="grid gap-3">
          <label className="grid gap-2">
            <div className="text-xs font-extrabold sb-title">Email</div>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com…"
              autoComplete="email"
              spellCheck={false}
              className="sb-input"
              disabled={busy || disabled}
            />
          </label>

          <label className="grid gap-2">
            <div className="text-xs font-extrabold sb-title">
              Referral code <span className="text-[color:var(--sb-muted)] font-semibold">(optional)</span>
            </div>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Paste code (or open a referral link)"
              autoComplete="off"
              spellCheck={false}
              className="sb-input"
              disabled={busy || disabled}
            />
          </label>

          <button
            type="button"
            className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
            onClick={requestCode}
            disabled={busy || disabled}
          >
            Send code
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="text-xs font-extrabold sb-title">6-digit code</div>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
              className="sb-input font-mono tracking-widest"
              disabled={busy || disabled}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
              onClick={verifyCode}
              disabled={busy || disabled}
            >
              Sign in
            </button>
            <button
              type="button"
              className="sb-btn h-11 px-5 text-sm font-semibold"
              onClick={requestCode}
              disabled={busy || disabled}
              aria-label="Resend code"
            >
              Resend
            </button>
            <button
              type="button"
              className="sb-btn h-11 px-5 text-sm font-semibold"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              disabled={busy || disabled}
            >
              Change email
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="sb-alert">{error}</div>
      ) : null}
    </div>
  );
}
