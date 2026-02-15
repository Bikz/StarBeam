export type PulseGateDecision =
  | { kind: "redirect_onboarding" }
  | { kind: "render_generating" }
  | { kind: "render_pulse" };

export function decidePulseGate(args: {
  editionsCount: number;
  onboardingEnabled: boolean;
  onboardingCompletedAt: Date | null | undefined;
}): PulseGateDecision {
  if (args.editionsCount > 0) return { kind: "render_pulse" };
  if (args.onboardingEnabled && !args.onboardingCompletedAt) {
    return { kind: "redirect_onboarding" };
  }
  return { kind: "render_generating" };
}
