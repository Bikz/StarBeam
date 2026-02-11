import type React from "react";

type HeadingTag = "h1" | "h2" | "h3";
type HeaderSize = "sm" | "md" | "lg";

export default function PageHeader({
  title,
  description,
  actions,
  as = "h2",
  size = "md",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  as?: HeadingTag;
  size?: HeaderSize;
}) {
  const Heading = as;
  const titleClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";

  return (
    <header className="grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Heading
          className={[
            "sb-title min-w-0 font-extrabold leading-tight",
            titleClass,
          ].join(" ")}
        >
          {title}
        </Heading>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {description ? (
        <div className="text-sm text-[color:var(--sb-muted)] leading-relaxed">
          {description}
        </div>
      ) : null}
    </header>
  );
}
