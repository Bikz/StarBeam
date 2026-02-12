"use client";

export default function HelpTip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={
        className ??
        "grid h-5 w-5 place-items-center rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/15 text-[10px] font-extrabold text-[color:var(--sb-muted)] select-none"
      }
      title={text}
      aria-label={text}
      role="img"
    >
      ?
    </span>
  );
}
