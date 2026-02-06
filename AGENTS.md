# AGENTS.md

This file is the primary set of operating instructions for agents working in this repo.

## Internal Docs

Create and use `docs/` for internal memory (plans, ADRs, requirements, reviews). The entire `docs/` folder is intentionally **gitignored** so it is never published as part of the open-source repo.

## Source Of Truth (Priority Order)

1. `AGENTS.md`
2. `README.md`
3. `docs/` (internal-only plans, ADRs, requirements)
4. Code + UI as-built (code reality wins)

## Two-Level Autonomous Loop

### Outer Loop: Product / PM Cycle (Epic Level)

Run at the start and after completing each plan.

1. Clarify product vision and target users (repo-based)
2. Identify 3–7 North Star user journeys
3. Inventory features + quality (Ship-ready / Partial / Broken / Missing)
4. Rank gaps by ROI and risk
5. Produce or refresh a prioritized `docs/PLAN.md`
6. Only pursue work that converges toward “ship-ready”

### Inner Loop: Delivery Cycle (Within An Epic)

Run continuously inside a plan.

1. Preflight: reconfirm epic acceptance criteria and Definition of Done
2. Work ONE epic at a time
3. Implement in small, safe increments
4. Validate quickly (format / lint / typecheck / tests)
5. Design Guardian pass:
   - coherent UX
   - empty/loading/error states
   - accessibility basics
6. Self-critique before commit:
   - acceptance criteria met?
   - error paths handled?
   - tests updated where appropriate?
   - docs updated if behavior changed?
7. Commit (small, atomic, epic-tagged)
8. Update progress docs
9. Repeat until epic is done, then move to next epic automatically

## Product Lead Rules (Mandatory)

- Tie all work to a user journey.
- Fix broken core journeys before adding new features.
- Prefer finishing and polishing over expanding scope.
- Use lightweight ROI thinking: Impact × Reach × Confidence ÷ Effort
- Bugs blocking core journeys outrank new features.

## Design Guardian Rules (Mandatory)

- Preserve existing design language and interaction patterns.
- No design drift across screens.
- Reuse components before inventing new ones.
- Every user-facing feature must have:
  - empty state
  - loading state
  - error state
- Accessibility is non-optional.
- If UI complexity increases, justify it and reduce complexity elsewhere.

## Engineering Rules (Mandatory)

- Small, atomic commits; commit often.
- Keep builds/tests green.
- Prefer simple, clear code over abstraction.
- Refactor when files or functions become unwieldy.
- Add regression tests for bug fixes when feasible.
- Deterministic core logic should be tested; flaky UI automation should be minimized.

## ADR Requirements

Create an ADR under `docs/adr/` (internal-only) when you:

- Change architecture or data flow
- Add/replace major dependencies
- Change schemas or migrations
- Alter sync/auth/billing semantics
- Make a significant UI paradigm shift

ADR must include:

- Context
- Decision
- Alternatives
- Consequences
- Rollback

## Stop Conditions (Strict)

Stop ONLY if a true blocker prevents progress (credentials, external hard blocker, legal/compliance risk).

If blocked:

1. Create `docs/BLOCKER.md` explaining:
   - what happened
   - why it blocks
   - what was tried
   - possible paths
2. Then stop.

Otherwise: continue automatically.

## Releasing (macOS)

- Direct-download release process (Sparkle updates, signing/notarization): `apps/macos/Starbeam/RELEASING.md`
- Private keys and notarization credentials must never be committed.
- End-to-end local release helper: `scripts/macos/cut_release.sh` (bumps version, builds, uploads, verifies)
