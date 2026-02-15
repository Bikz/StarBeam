function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

function defaultEnabledWhenUnset(name: string): boolean {
  const value = process.env[name];
  if (typeof value === "undefined") {
    return process.env.NODE_ENV !== "production";
  }
  return isTruthy(value);
}

export function isContextSplitEnabled(): boolean {
  if (process.env.STARB_CONTEXT_SPLIT_V1 === undefined) return true;
  return isTruthy(process.env.STARB_CONTEXT_SPLIT_V1);
}

export function isFirstPulseAutoRetryEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_FIRST_PULSE_AUTO_RETRY_V1");
}

export function isOnboardingV2Enabled(): boolean {
  return defaultEnabledWhenUnset("STARB_ONBOARDING_V2");
}

export function isActivationSloEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_ACTIVATION_SLO_V1");
}

export function isMacosActivationHintsEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_MACOS_ACTIVATION_HINTS_V1");
}

export function isInsightEngineV2Enabled(): boolean {
  return defaultEnabledWhenUnset("STARB_INSIGHT_ENGINE_V2");
}

export function isPersonaRouterEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_PERSONA_ROUTER_V1");
}

export function isSkillRouterEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_SKILL_ROUTER_V1");
}

export function isOpenAIHostedShellEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_OPENAI_HOSTED_SHELL_V1");
}

export function isCompactionEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_COMPACTION_V1");
}

export function isInsightFeedbackEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_INSIGHT_FEEDBACK_V1");
}

export function isInsightUiPolishEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_INSIGHT_UI_POLISH_V1");
}

export function isActionStateServerEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_ACTION_STATE_SERVER_V1");
}

export function isOpsManualSkillControlEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_OPS_MANUAL_SKILL_CONTROL_V1");
}
