"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/toast-provider";

export default function SearchParamToasts() {
  const sp = useSearchParams();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { push } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    let changed = false;

    if (params.get("queued") === "1") {
      push({ kind: "success", title: "Queued", message: "Nightly run queued." });
      params.delete("queued");
      changed = true;
    }

    if (params.get("sent") === "1") {
      push({ kind: "success", title: "Sent", message: "Feedback submitted." });
      params.delete("sent");
      changed = true;
    }

    if (changed) {
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    }
  }, [pathname, push, router, sp]);

  return null;
}

