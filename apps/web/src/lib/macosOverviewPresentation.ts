export type OnboardingMode = "SETUP" | "DAILY";
export type OnboardingChecklistStatus = "TODO" | "DONE";

export type OnboardingChecklistKey =
  | "profile"
  | "personal_goal"
  | "integration";

export type OnboardingChecklistItem = {
  key: OnboardingChecklistKey;
  title: string;
  status: OnboardingChecklistStatus;
  ctaLabel: string;
  ctaUrl?: string;
};

export type OnboardingPayload = {
  mode: OnboardingMode;
  checklist: OnboardingChecklistItem[];
};

export type PulseLane = "ONBOARDING" | "DAILY";

export type PulseCitation = {
  url: string;
  title?: string;
};

export function buildOnboardingPayload(args: {
  workspaceSlug: string;
  hasPersonalProfile: boolean;
  hasPersonalGoal: boolean;
  hasIntegration: boolean;
}): OnboardingPayload {
  const base = `/w/${encodeURIComponent(args.workspaceSlug)}`;

  const checklist: OnboardingChecklistItem[] = [
    {
      key: "profile",
      title: "Complete your personal profile",
      status: args.hasPersonalProfile ? "DONE" : "TODO",
      ctaLabel: "Open profile",
      ctaUrl: `${base}/profile`,
    },
    {
      key: "personal_goal",
      title: "Add one personal goal",
      status: args.hasPersonalGoal ? "DONE" : "TODO",
      ctaLabel: "Add goal",
      ctaUrl: `${base}/tracks#personal-goals`,
    },
    {
      key: "integration",
      title: "Connect one integration",
      status: args.hasIntegration ? "DONE" : "TODO",
      ctaLabel: "Open integrations",
      ctaUrl: `${base}/integrations`,
    },
  ];

  return {
    mode: checklist.every((item) => item.status === "DONE") ? "DAILY" : "SETUP",
    checklist,
  };
}

export function inferPulseLane(args: {
  onboardingMode: OnboardingMode;
  onboardingChecklist: OnboardingChecklistItem[];
  kind: string;
  title: string;
  body?: string | null;
  action?: string | null;
}): PulseLane {
  if (args.onboardingMode !== "SETUP") return "DAILY";
  if (args.kind !== "INTERNAL") return "DAILY";

  const text = `${args.title}\n${args.body ?? ""}\n${args.action ?? ""}`.toLowerCase();
  const needsProfile = checklistStatus(args.onboardingChecklist, "profile") === "TODO";
  const needsGoal =
    checklistStatus(args.onboardingChecklist, "personal_goal") === "TODO";
  const needsIntegration =
    checklistStatus(args.onboardingChecklist, "integration") === "TODO";

  if (
    needsProfile &&
    matchesAny(text, ["personal profile", "job title", "about section", "role"])
  ) {
    return "ONBOARDING";
  }

  if (
    needsGoal &&
    matchesAny(text, ["personal goal", "add one personal goal", "goal for your work"])
  ) {
    return "ONBOARDING";
  }

  if (
    needsIntegration &&
    matchesAny(text, ["connect one integration", "github", "linear", "notion", "google drive", "integration"])
  ) {
    return "ONBOARDING";
  }

  return "DAILY";
}

export function pulseSourceLabel(args: {
  lane: PulseLane;
  kind: string;
  title: string;
  citations: PulseCitation[];
}): string | undefined {
  if (args.lane === "ONBOARDING") return "Setup";

  if (args.kind === "ANNOUNCEMENT") return "Announcement";
  if (args.kind === "GOAL") return "Goal";

  if (args.kind === "WEB_RESEARCH") {
    const first = args.citations[0];
    if (first?.title && first.title.trim().length > 0) {
      return first.title.trim();
    }

    if (first?.url) {
      const host = hostLabel(first.url);
      if (host) return host;
    }

    return "Web research";
  }

  if (args.title.trim().toLowerCase().startsWith("task:")) {
    return "Task queue";
  }

  return undefined;
}

function checklistStatus(
  checklist: OnboardingChecklistItem[],
  key: OnboardingChecklistKey,
): OnboardingChecklistStatus {
  return checklist.find((item) => item.key === key)?.status ?? "DONE";
}

function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function hostLabel(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return undefined;
    return host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
