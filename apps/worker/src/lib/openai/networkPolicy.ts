export type HostedShellNetworkProfile = "MINIMAL" | "BROAD";

const PROFILE_DOMAINS: Record<HostedShellNetworkProfile, string[]> = {
  MINIMAL: ["pypi.org", "files.pythonhosted.org", "github.com"],
  BROAD: [
    "pypi.org",
    "files.pythonhosted.org",
    "github.com",
    "raw.githubusercontent.com",
    "registry.npmjs.org",
    "deb.debian.org",
    "api.github.com",
    "docs.python.org",
    "developer.mozilla.org",
  ],
};

function normalizeDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  if (!value) return "";
  return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function isValidDomain(value: string): boolean {
  // Domain allowlist only; no paths, no ports, no wildcards.
  return /^[a-z0-9.-]+$/.test(value);
}

export function parseHostedShellNetworkProfile(
  raw: string | undefined,
): HostedShellNetworkProfile {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "MINIMAL") return "MINIMAL";
  return "BROAD";
}

export function allowedDomainsForProfile(
  profile: HostedShellNetworkProfile,
): string[] {
  return (PROFILE_DOMAINS[profile] ?? PROFILE_DOMAINS.BROAD).slice();
}

export function validateRequestedDomains(args: {
  requestedDomains: string[];
  approvedDomains: string[];
}): string[] {
  const approved = new Set(
    args.approvedDomains.map((domain) => normalizeDomain(domain)),
  );
  const normalized = args.requestedDomains
    .map((domain) => normalizeDomain(domain))
    .filter(Boolean);

  for (const domain of normalized) {
    if (!isValidDomain(domain)) {
      throw new Error(`Hosted shell domain "${domain}" is invalid.`);
    }
    if (!approved.has(domain)) {
      throw new Error(
        `Hosted shell domain "${domain}" is not in approved allowlist.`,
      );
    }
  }

  return Array.from(new Set(normalized));
}

export function buildHostedShellNetworkPolicy(args?: {
  profile?: HostedShellNetworkProfile;
  requestedDomains?: string[];
}): { type: "allowlist"; allowed_domains: string[] } {
  const profile =
    args?.profile ??
    parseHostedShellNetworkProfile(
      process.env.STARB_HOSTED_SHELL_NETWORK_PROFILE,
    );
  const approved = allowedDomainsForProfile(profile);
  const requested = args?.requestedDomains ?? approved;
  const allowed = validateRequestedDomains({
    requestedDomains: requested,
    approvedDomains: approved,
  });

  if (allowed.length === 0) {
    throw new Error("Hosted shell allowlist is empty.");
  }

  return {
    type: "allowlist",
    allowed_domains: allowed,
  };
}
