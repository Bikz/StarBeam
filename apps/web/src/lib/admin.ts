export function isAdminEmail(email: string | null | undefined): boolean {
  const raw =
    process.env.STARB_ADMIN_EMAILS ?? process.env.BETA_ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  const e = (email ?? "").trim().toLowerCase();
  return Boolean(e) && allowed.includes(e);
}
