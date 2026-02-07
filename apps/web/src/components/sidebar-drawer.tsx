"use client";

import { useEffect } from "react";

export default function SidebarDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 dark:bg-black/60"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={[
          "absolute inset-y-0 left-0 w-[92vw] max-w-sm",
          "overscroll-contain overflow-y-auto",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

