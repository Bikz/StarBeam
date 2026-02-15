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

export function isSkillDiscoveryShadowEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_SKILL_DISCOVERY_SHADOW_V1");
}

export function isPersonaSubmodesEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_PERSONA_SUBMODES_V1");
}

export function isDiscoveredSkillExecutionEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_DISCOVERED_SKILL_EXEC_V1");
}

export function isGoalHelpfulnessEvalEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_GOAL_HELPFULNESS_EVAL_V1");
}

export function isHybridRankerEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_HYBRID_RANKER_V1");
}

export function isSkillDistillationEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_SKILL_DISTILLATION_V1");
}

export function isOpsManualSkillControlEnabled(): boolean {
  return defaultEnabledWhenUnset("STARB_OPS_MANUAL_SKILL_CONTROL_V1");
}
