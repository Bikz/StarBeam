export const onboardingSteps = [
  { key: "name", path: "name", optional: false },
  { key: "location", path: "location", optional: false },
  { key: "role", path: "role", optional: false },
  { key: "company", path: "company", optional: false },
  { key: "profile", path: "profile", optional: true },
  { key: "goals", path: "goals", optional: true },
  { key: "integrations", path: "integrations", optional: true },
  { key: "macos", path: "macos", optional: true },
  { key: "finish", path: "finish", optional: false },
] as const;

export type OnboardingStepKey = (typeof onboardingSteps)[number]["key"];
