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
      push({
        kind: "success",
        title: "Queued",
        message: "Nightly run queued.",
      });
      params.delete("queued");
      changed = true;
    }

    if (params.get("sent") === "1") {
      push({ kind: "success", title: "Sent", message: "Feedback submitted." });
      params.delete("sent");
      changed = true;
    }

    // Announcements now render inline notices from query params. Do not consume
    // them here, or the URL cleanup race can hide the inline message.
    const isAnnouncementsRoute = pathname.endsWith("/announcements");
    if (!isAnnouncementsRoute) {
      const notice = (params.get("notice") ?? "").trim().toLowerCase();
      if (notice === "created") {
        push({
          kind: "success",
          title: "Posted",
          message: "Announcement posted.",
        });
        params.delete("notice");
        changed = true;
      } else if (notice === "updated") {
        push({
          kind: "success",
          title: "Saved",
          message: "Announcement updated.",
        });
        params.delete("notice");
        changed = true;
      } else if (notice === "deleted") {
        push({
          kind: "success",
          title: "Deleted",
          message: "Announcement deleted.",
        });
        params.delete("notice");
        changed = true;
      }
    }

    if (changed) {
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    }
  }, [pathname, push, router, sp]);

  return null;
}
