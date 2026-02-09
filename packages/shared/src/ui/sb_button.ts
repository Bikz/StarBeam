export type SbButtonVariant = "primary" | "secondary" | "ghost";
export type SbButtonSize = "sm" | "md" | "lg" | "icon";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export function sbButtonClass(opts?: {
  variant?: SbButtonVariant;
  size?: SbButtonSize;
  className?: string;
}) {
  const variant = opts?.variant ?? "secondary";
  const size = opts?.size;

  const variantClass =
    variant === "primary"
      ? "sb-btn sb-btn-primary"
      : variant === "ghost"
        ? "sb-btn sb-btn-ghost"
        : "sb-btn";

  const sizeClass =
    size === "sm"
      ? "h-9 px-4 text-xs font-semibold"
      : size === "md"
        ? "h-11 px-5 text-sm font-semibold"
        : size === "lg"
          ? "h-12 px-6 text-sm font-extrabold"
          : size === "icon"
            ? "h-10 w-10 inline-flex items-center justify-center"
            : undefined;

  return cx(variantClass, sizeClass, opts?.className);
}

