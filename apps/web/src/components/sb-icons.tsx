import type { ComponentProps } from "react";

type SvgProps = ComponentProps<"svg">;

function baseProps(props: SvgProps): SvgProps {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function IconHome(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.75V20h11V10.75" />
    </svg>
  );
}

export function IconSpark(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M12 2l1.2 4.2L17.5 7.5l-4.3 1.3L12 13l-1.2-4.2L6.5 7.5l4.3-1.3L12 2z" />
      <path d="M19 13l.6 2.1 2.1.6-2.1.6L19 18l-.6-2.1-2.1-.6 2.1-.6L19 13z" />
    </svg>
  );
}

export function IconList(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

export function IconMegaphone(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M3 11v2a3 3 0 0 0 3 3h1" />
      <path d="M7 10v8" />
      <path d="M7 10l12-4v12l-12-4" />
      <path d="M19 6v12" />
    </svg>
  );
}

export function IconUsers(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      <path d="M22 21v-2a3 3 0 0 0-2-2.83" />
      <path d="M16 3.17a4 4 0 0 1 0 7.66" />
    </svg>
  );
}

export function IconPlug(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M9 7V3" />
      <path d="M15 7V3" />
      <path d="M7 9h10" />
      <path d="M7 9v3a5 5 0 0 0 10 0V9" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function IconClock(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function IconSettings(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.7 7.7 0 0 0 .1-6l-2.2.3a7.4 7.4 0 0 0-1.3-1.3l.3-2.2a7.7 7.7 0 0 0-6-.1l.3 2.2a7.4 7.4 0 0 0-1.3 1.3L5.1 9a7.7 7.7 0 0 0-.1 6l2.2-.3a7.4 7.4 0 0 0 1.3 1.3l-.3 2.2a7.7 7.7 0 0 0 6 .1l-.3-2.2a7.4 7.4 0 0 0 1.3-1.3l2.2.3z" />
    </svg>
  );
}

export function IconSearch(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z" />
      <path d="M21 21l-4.2-4.2" />
    </svg>
  );
}

export function IconChevronLeft(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function IconLogout(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M10 17l-1 0a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h1" />
      <path d="M15 12H8" />
      <path d="M12 9l3 3-3 3" />
      <path d="M15 3h4v18h-4" />
    </svg>
  );
}

export function IconMessage(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

export function IconGrid(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </svg>
  );
}

export function IconSun(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconMoon(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M21 13a7.5 7.5 0 1 1-10-10 6 6 0 0 0 10 10z" />
    </svg>
  );
}

export function IconMonitor(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M4 5h16v11H4z" />
      <path d="M8 21h8" />
      <path d="M12 16v5" />
    </svg>
  );
}

export function IconCopy(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M9 9h11v11H9z" />
      <path d="M4 4h11v11H4z" />
    </svg>
  );
}

export function IconArrowUpRight(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M7 17L17 7" />
      <path d="M10 7h7v7" />
    </svg>
  );
}

export function IconCheck(props: SvgProps) {
  return (
    <svg aria-hidden="true" role="presentation" focusable="false" {...baseProps(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
