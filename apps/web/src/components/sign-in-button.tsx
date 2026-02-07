"use client";

import { signIn, useSession } from "next-auth/react";

export default function SignInButton({
  provider = "google",
  label = "Sign in with Google",
  callbackUrl = "/beta",
}: {
  provider?: string;
  label?: string;
  callbackUrl?: string;
}) {
  const { status } = useSession();

  return (
    <button
      type="button"
      className="sb-btn px-5 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
      onClick={() => signIn(provider, { callbackUrl })}
      disabled={status === "loading"}
    >
      {label}
    </button>
  );
}
