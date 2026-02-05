"use client";

import { signIn, useSession } from "next-auth/react";

export default function SignInButton() {
  const { status } = useSession();

  return (
    <button
      type="button"
      className="sb-btn px-5 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      disabled={status === "loading"}
    >
      Sign in with Google
    </button>
  );
}

