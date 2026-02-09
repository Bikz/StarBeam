"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function isProbablyValidEmail(email: string): boolean {
  // Keep this permissive; the server validates. This is just to keep the primary
  // CTA disabled until the user enters something plausibly correct.
  const e = email.trim();
  if (!e) return false;
  const at = e.indexOf("@");
  if (at <= 0) return false;
  const dot = e.lastIndexOf(".");
  if (dot <= at + 1) return false;
  return dot < e.length - 1;
}

type Step = "email" | "code";

export default function EmailCodeSignIn({
  callbackUrl = "/beta",
  initialEmail = "",
  variant = "signin",
}: {
  callbackUrl?: string;
  initialEmail?: string;
  variant?: "signin" | "waitlist";
}) {
  function sameOriginPath(href: string): string {
    // NextAuth may return an absolute URL (and can sometimes be misconfigured to
    // a different host). Keep navigation on the current origin.
    try {
      const u = new URL(href, window.location.origin);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return href.startsWith("/") ? href : "/beta";
    }
  }

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(() => initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const emailValue = useMemo(() => normalizeEmail(email), [email]);
  const canContinue = isProbablyValidEmail(emailValue) && !busy;
  const canVerify = /^[0-9]{6}$/.test(code.trim()) && !busy;

  const resendCooldownMs = 30_000;
  const resendRemainingMs =
    step === "code" && sentAt ? Math.max(0, resendCooldownMs - (now - sentAt)) : 0;
  const resendRemainingSec = Math.ceil(resendRemainingMs / 1000);
  const canResend = step === "code" && resendRemainingMs === 0 && !busy;

  useEffect(() => {
    if (step !== "code" || !sentAt) return;
    if (resendRemainingMs <= 0) return;

    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [step, sentAt, resendRemainingMs]);

  async function requestCode() {
    setError(null);
    if (!isProbablyValidEmail(emailValue)) {
      setError("Enter a valid email.");
      return;
    }

    setBusy(true);
    try {
      const resp = await fetch("/api/auth/email/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue }),
      });
      if (!resp.ok) {
        setError("Could not send a code. Try again.");
        return;
      }
      setSentAt(Date.now());
      setNow(Date.now());
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
        redirect: false,
      });

      if (resp?.error) {
        setError("Invalid code. Try again.");
        return;
      }

      // Use a hard navigation so NextAuth cookies/session are applied consistently.
      window.location.assign(sameOriginPath(resp?.url ?? callbackUrl));
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const sentHint =
    step === "code" && sentAt
      ? `We sent a code to ${emailValue || "your email"}.`
      : "";

  return (
    <div className="grid gap-4">
      {sentHint ? (
        <div className="text-sm text-[color:var(--sb-muted)] leading-relaxed">
          {sentHint}
        </div>
      ) : null}

      {step === "email" ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canContinue) return;
            requestCode();
          }}
        >
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
            disabled={busy}
          />
          </label>

          <button
            type="submit"
            className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
            disabled={!canContinue}
          >
            {variant === "waitlist" ? "Continue" : "Log in"}
          </button>
        </form>
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
              disabled={busy}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
              onClick={verifyCode}
              disabled={!canVerify}
            >
              {variant === "waitlist" ? "Continue" : "Log in"}
            </button>
            <button
              type="button"
              className="sb-btn h-9 px-4 text-xs font-semibold"
              onClick={requestCode}
              disabled={!canResend}
              aria-label="Resend code"
            >
              {resendRemainingSec > 0 ? `Resend (${resendRemainingSec}s)` : "Resend"}
            </button>
            <button
              type="button"
              className="sb-btn h-9 px-4 text-xs font-semibold"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              disabled={busy}
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
