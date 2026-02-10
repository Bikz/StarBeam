# Security Policy

## Reporting

If you believe you have found a security vulnerability, please email the maintainers at the address listed in
`README.md` (or open a private report if the hosting platform supports it).

Please include:

- a description of the issue and potential impact
- reproduction steps (or a proof-of-concept)
- affected versions/commits if known

## Automated Scanning

This repo uses:

- Dependency vulnerability scanning in CI (`pnpm audit`)
- Secret scanning in CI (Gitleaks)
- Automated dependency update PRs (Dependabot)

See `.github/workflows/ci.yml` and `.github/dependabot.yml`.
