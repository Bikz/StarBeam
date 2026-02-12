export const SESSION_RECOVERED_ERROR = "session_recovered";

export function buildSignOutUrl(callbackUrl: string): string {
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function staleSessionLoginUrl(): string {
  return `/login?error=${SESSION_RECOVERED_ERROR}`;
}

export function staleSessionSignOutUrl(): string {
  return buildSignOutUrl(staleSessionLoginUrl());
}

export function isSessionRecoveredError(code: string): boolean {
  return code.trim().toLowerCase() === SESSION_RECOVERED_ERROR;
}

export function loginErrorMessage(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (normalized === "credentialssignin") {
    return "That code didn’t work. Please try again.";
  }
  if (normalized === SESSION_RECOVERED_ERROR) {
    return "Your session expired and was reset. Please sign in again.";
  }
  return "Could not sign in. Please try again.";
}
