export type OnboardingActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: {
    fullName?: string;
    location?: string;
    jobTitle?: string;
    company?: string;
    companyUrl?: string;
    url?: string;
    goal?: string;
  };
};

export const initialOnboardingActionState: OnboardingActionState = { ok: true };
