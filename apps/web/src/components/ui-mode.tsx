"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type UiMode = "simple" | "advanced";

type UiModeContextValue = {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  toggle: () => void;
  workspaceSlug: string;
};

const UiModeContext = createContext<UiModeContextValue | null>(null);

function storageKey(workspaceSlug: string): string {
  const slug = workspaceSlug.trim() || "global";
  return `sb_ui_mode:${slug}`;
}

function normalizeMode(raw: string | null): UiMode | null {
  if (raw === "simple" || raw === "advanced") return raw;
  return null;
}

export function UiModeProvider({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  const key = storageKey(workspaceSlug);
  const [mode, setModeState] = useState<UiMode>(() => {
    if (typeof window === "undefined") return "simple";
    try {
      return normalizeMode(window.localStorage.getItem(key)) ?? "simple";
    } catch {
      return "simple";
    }
  });

  const setMode = useCallback(
    (next: UiMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignore
      }
    },
    [key],
  );

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: UiMode = prev === "advanced" ? "simple" : "advanced";
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, [key]);

  const value = useMemo(
    () => ({ mode, setMode, toggle, workspaceSlug }),
    [mode, setMode, toggle, workspaceSlug],
  );

  return (
    <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>
  );
}

export function useUiMode(): UiModeContextValue {
  const ctx = useContext(UiModeContext);
  if (!ctx) {
    throw new Error("useUiMode must be used within UiModeProvider");
  }
  return ctx;
}

export function AdvancedOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useUiMode();
  if (mode !== "advanced") return null;
  return <>{children}</>;
}
