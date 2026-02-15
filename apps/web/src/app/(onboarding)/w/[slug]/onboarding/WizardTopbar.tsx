"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { onboardingSteps } from "./steps";

function parseWizardLocation(pathname: string): {
  basePath: string;
  stepIndex: number;
} {
  const parts = pathname.split("/").filter(Boolean);
  const onboardingIdx = parts.indexOf("onboarding");
  if (onboardingIdx === -1) {
    return { basePath: "/dashboard", stepIndex: 0 };
  }

  const basePath = `/${parts.slice(0, onboardingIdx + 1).join("/")}`;
  const stepPath = parts[onboardingIdx + 1] ?? onboardingSteps[0].path;
  const stepIndex = Math.max(
    0,
    onboardingSteps.findIndex((s) => s.path === stepPath),
  );

  return { basePath, stepIndex };
}

export default function WizardTopbar() {
  const pathname = usePathname() ?? "";
  const { basePath, stepIndex } = parseWizardLocation(pathname);
  const total = onboardingSteps.length;

  const prev = stepIndex > 0 ? onboardingSteps[stepIndex - 1] : undefined;
  const backHref = prev ? `${basePath}/${prev.path}` : null;

  return (
    <div className="sb-container pt-5">
      <div className="flex items-center justify-between gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className={sbButtonClass({
              variant: "secondary",
              className: "h-10 px-4 text-xs font-semibold",
            })}
          >
            Back
          </Link>
        ) : (
          <div className="h-10 w-[72px]" />
        )}

        <Link
          href={basePath}
          aria-label="Starbeam onboarding"
          className={[
            "sb-card-inset grid h-10 w-10 place-items-center border border-black/10 dark:border-white/10 rounded-xl",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
          ].join(" ")}
        >
          <Image
            src="/brand/starbeam-logo-light.png"
            alt=""
            width={26}
            height={26}
            unoptimized
            priority
            className="block dark:hidden"
          />
          <Image
            src="/brand/starbeam-logo-dark.png"
            alt=""
            width={26}
            height={26}
            unoptimized
            priority
            className="hidden dark:block"
          />
        </Link>

        <div className="sb-pill text-xs">
          Step {Math.min(total, stepIndex + 1)} of {total}
        </div>
      </div>
    </div>
  );
}
