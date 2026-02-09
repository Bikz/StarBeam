"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export default function SignOutCard({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signOut({ callbackUrl, redirect: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        Sign out
      </button>
    </div>
  );
}

