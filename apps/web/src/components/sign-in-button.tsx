"use client";

import { signIn, useSession } from "next-auth/react";
import { sbButtonClass } from "@starbeam/shared";

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
      className={sbButtonClass({
        variant: "secondary",
        className: "px-5 py-3 text-sm font-semibold",
      })}
      onClick={() => signIn(provider, { callbackUrl })}
      disabled={status === "loading"}
    >
      {label}
    </button>
  );
}
