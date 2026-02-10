"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export default function TimezoneReporter() {
  const { data } = useSession();

  useEffect(() => {
    const userId = data?.user?.id;
    if (!userId) return;

    const tz = browserTimeZone();
    if (!tz) return;

    const key = `sb_tz_reported:${userId}`;
    const last =
      typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (last === tz) return;

    void fetch("/api/user/timezone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        window.localStorage.setItem(key, tz);
      })
      .catch(() => undefined);
  }, [data?.user?.id]);

  return null;
}
