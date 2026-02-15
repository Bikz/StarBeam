export type FirstPulseState =
  | "not_started"
  | "queued"
  | "running"
  | "ready"
  | "failed_retriable"
  | "failed_blocking";

export type FirstPulseJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIAL"
  | null;

export type FirstPulsePrimaryAction =
  | "connect_google"
  | "generate_now"
  | "refresh"
  | "open_integrations"
  | "open_pulse";

export type FirstPulseActivationInput = {
  hasAnyPulse: boolean;
  hasGoogleConnection: boolean;
  googleAuthConfigured: boolean;
  queuedFromQueryParam: boolean;
  bootstrapStatus: FirstPulseJobStatus;
  autoFirstStatus: FirstPulseJobStatus;
  bootstrapErrorSummary?: string | null;
  autoFirstErrorSummary?: string | null;
  bootstrapQueuedAgeMins?: number | null;
  bootstrapRunningAgeMins?: number | null;
  autoFirstQueuedAgeMins?: number | null;
  autoFirstRunningAgeMins?: number | null;
  staleThresholdMins?: number | null;
};

export type FirstPulseActivation = {
  state: FirstPulseState;
  primaryAction: FirstPulsePrimaryAction;
  title: string;
  description: string;
  errorDetail: string | null;
};

function normalizeError(summary: string | null | undefined): string | null {
  const text = (summary ?? "").trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  if (
    lower.includes("missing google_client_id") ||
    lower.includes("missing google_client_secret") ||
    lower.includes("oauth")
  ) {
    return "Google OAuth appears misconfigured. Open integrations and reconnect after environment fixes.";
  }

  if (
    lower.includes("rate") ||
    lower.includes("timeout") ||
    lower.includes("tempor") ||
    lower.includes("network")
  ) {
    return "A temporary connectivity issue blocked the first pulse. Retry now.";
  }

  return text;
}

function hasStatus(
  statuses: ReadonlyArray<FirstPulseJobStatus>,
  target: Exclude<FirstPulseJobStatus, null>,
): boolean {
  return statuses.includes(target);
}

function classifyBlocking(summary: string | null): boolean {
  if (!summary) return false;
  const lower = summary.toLowerCase();
  return (
    lower.includes("misconfigured") ||
    lower.includes("missing google_client_id") ||
    lower.includes("missing google_client_secret") ||
    lower.includes("google oauth")
  );
}

function isStale(args: {
  queuedAgeMins?: number | null;
  runningAgeMins?: number | null;
  staleThresholdMins: number;
}): boolean {
  const queuedAge =
    typeof args.queuedAgeMins === "number" ? args.queuedAgeMins : -1;
  const runningAge =
    typeof args.runningAgeMins === "number" ? args.runningAgeMins : -1;
  return (
    queuedAge >= args.staleThresholdMins ||
    runningAge >= args.staleThresholdMins
  );
}

export function deriveFirstPulseActivation(
  input: FirstPulseActivationInput,
): FirstPulseActivation {
  const staleThresholdMins =
    typeof input.staleThresholdMins === "number" && input.staleThresholdMins > 0
      ? Math.floor(input.staleThresholdMins)
      : 20;

  if (input.hasAnyPulse) {
    return {
      state: "ready",
      primaryAction: "open_pulse",
      title: "Your pulse is ready",
      description: "Open today’s pulse and start your daily loop.",
      errorDetail: null,
    };
  }

  if (!input.googleAuthConfigured) {
    return {
      state: "failed_blocking",
      primaryAction: "open_integrations",
      title: "Google connection is blocked",
      description:
        "Google OAuth is not configured in this environment. Configure it before generating a pulse.",
      errorDetail: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    };
  }

  if (!input.hasGoogleConnection) {
    return {
      state: "not_started",
      primaryAction: "connect_google",
      title: "Connect Google to start",
      description:
        "Starbeam needs one connected source before it can generate your first pulse.",
      errorDetail: null,
    };
  }

  const statuses = [input.bootstrapStatus, input.autoFirstStatus];
  const stale =
    isStale({
      queuedAgeMins: input.bootstrapQueuedAgeMins,
      runningAgeMins: input.bootstrapRunningAgeMins,
      staleThresholdMins,
    }) ||
    isStale({
      queuedAgeMins: input.autoFirstQueuedAgeMins,
      runningAgeMins: input.autoFirstRunningAgeMins,
      staleThresholdMins,
    });

  if (stale) {
    return {
      state: "failed_retriable",
      primaryAction: "generate_now",
      title: "First pulse appears stuck",
      description:
        "The first run has been queued/running longer than expected. Retry now to recover.",
      errorDetail: `No completion after ${staleThresholdMins} minutes.`,
    };
  }

  if (hasStatus(statuses, "RUNNING")) {
    return {
      state: "running",
      primaryAction: "refresh",
      title: "Generating your first pulse",
      description:
        "A run is in progress. Refresh in a moment to check for completion.",
      errorDetail: null,
    };
  }

  if (input.queuedFromQueryParam || hasStatus(statuses, "QUEUED")) {
    return {
      state: "queued",
      primaryAction: "refresh",
      title: "First pulse queued",
      description:
        "Your first pulse is queued. It usually completes in a few minutes.",
      errorDetail: null,
    };
  }

  const normalizedError =
    normalizeError(input.bootstrapErrorSummary) ??
    normalizeError(input.autoFirstErrorSummary);

  if (hasStatus(statuses, "FAILED") || hasStatus(statuses, "PARTIAL")) {
    if (classifyBlocking(normalizedError)) {
      return {
        state: "failed_blocking",
        primaryAction: "open_integrations",
        title: "First pulse is blocked",
        description:
          "A blocking setup issue prevented generation. Resolve it, then try again.",
        errorDetail: normalizedError,
      };
    }

    return {
      state: "failed_retriable",
      primaryAction: "generate_now",
      title: "First pulse needs a retry",
      description:
        "Generation failed due to a recoverable issue. Retry now to continue onboarding.",
      errorDetail: normalizedError,
    };
  }

  if (hasStatus(statuses, "SUCCEEDED")) {
    return {
      state: "failed_retriable",
      primaryAction: "generate_now",
      title: "Run completed but pulse is missing",
      description:
        "No pulse was produced from the last run. Retry now to rebuild the first edition.",
      errorDetail: normalizedError,
    };
  }

  return {
    state: "not_started",
    primaryAction: "generate_now",
    title: "Generate your first pulse",
    description:
      "You’re connected. Generate now to create your first daily pulse.",
    errorDetail: null,
  };
}
