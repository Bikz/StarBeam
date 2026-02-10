"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ToastKind = "info" | "success" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastContextValue = {
  push: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider />");
  return ctx;
}

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = randomId();
    setToasts((prev) => [...prev, { ...t, id }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 top-4 z-[60] grid gap-2"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <div key={t.id} className="sb-card max-w-sm px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold sb-title text-[color:var(--sb-fg)] truncate">
                  {t.title}
                </div>
                {t.message ? (
                  <div className="mt-0.5 text-xs text-[color:var(--sb-muted)] leading-relaxed">
                    {t.message}
                  </div>
                ) : null}
              </div>
              <div className="sb-pill">{t.kind}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
