# AI Usage Notes

## 1. Tools and what they were used for

| Tool | Used for |
|---|---|
| Claude Code (CLI, Claude Sonnet 5.5) | Interviewing the author to shape the spec; drafting `spec.md`, `assumptions.md`, `RBAC.md`, `test-plan.md`, README; writing the backend, frontend, tests, Docker and CI files; running tests, audits and an exploratory session against the live stack |
| Claude Code skill `grilling` (user's personal skill) | Ran the requirements interview: one decision at a time, each with a recommended answer, until every branch of the design tree was settled |
| Design skills in `.agents/skills/` (linked from `.claude/skills/`) | The author's general skill library for UI and motion work (e.g. `emil-design-eng`, `break-ui`, `animate`), committed so the setup is reproducible. They were not used to build this module; the only project-specific skills are `new-capability` and `review-against-spec` |
| No other AI tools | |

## 2. How the work was framed (process, in order)

1. **Read the exam** and list what it grades (requirements, working software, testing, design, AI delivery, handoff).
2. **Requirements interview (about 30 questions).** The AI proposed an option with its reasoning; the author decided. Every decision was written to `docs/decisions.md` (D1–D31) at the time. Examples where the author overrode or changed the AI's recommendation: stack (TypeScript instead of Java/Angular), multi-tenant (added, then dropped to single school), superadmin (dropped), custom roles (chosen over the simpler fixed mapping), SSE (chosen, then switched to polling), departure time for forgotten check-outs (author probed the alternative, then chose closing time), correction of unverified departures (author chose to build it). The AI also flagged where an answer changed an earlier decision (e.g. D9/D19) so the log stayed consistent.
3. **Spec before code**: `spec.md` with Given/When/Then criteria, lifecycle diagram and risks was committed first.
4. **Build in priority order, tests alongside**: domain state machine and rules with unit tests → schema and services → REST API with Testcontainers integration tests → UI → Docker → Playwright → CI and docs.
5. **Verify against the running system**, not only against tests: `docker compose` stack, screenshots of each role's screen, an exploratory session (see `test-plan.md`).

## 3. Instruction files and set-up that worked

- `CLAUDE.md` (repo root): stack, commands, and eight architecture rules (state changes only via the state machine; permissions not role names; injected clock; audit everything; notification channel boundary; pass validity; minimal personal data; derived overstay). These are the rules most likely to be broken by a plausible-looking change, so they are written as rules, not descriptions.
- `.claude/skills/new-capability`: a 10-step checklist (spec/AC, priority, domain rule, permission, audit, notification, API test, UI, traceability, verify). Used so each capability follows the same path.
- `.claude/skills/review-against-spec`: a review prompt that checks a diff against the rules above and the spec, reporting only concrete failures.
- `docs/decisions.md` as shared memory: decisions are written down so a later session (or a new teammate) does not re-open them.

## 4. Guardrails relied on

| Guardrail | What it caught or prevents |
|---|---|
| Domain unit tests (67 → 68) | Every illegal state transition; time-rule edges |
| Integration tests on real PostgreSQL (29) | Permission denials, race between answer and timeout, audit table immutability at the database level, sweep/retention behaviour |
| Playwright e2e (3) | The UI, proxy, API, DB and polling working together; the check-in confirmation dialog |
| ESLint (+ React rules) and TypeScript strict mode | See corrections below |
| `npm audit --omit=dev --audit-level=high`, also in CI | See corrections below |
| Pre-commit hook (lint + unit tests) and GitHub Actions CI | Regressions before they reach the history |
| Server-side only authorisation, zod validation on every body | UI bugs cannot become permission bugs |
| Exploratory testing of the live system | One real bug the tests had missed |

## 5. Examples where AI output was corrected or rejected

Only genuine corrections of AI output are listed; requirement changes made by the author are in the decision log, not here.

1. **Vulnerable dependency versions (caught by `npm audit`).** The AI scaffolded the frontend on Next.js 14 and the backend on NestJS 10 from memory. `npm audit` reported 1 critical and 1 high (frontend) and several moderate (backend) advisories, including Next.js rewrite request-smuggling and SSRF issues. This project relies on a rewrite for its `/api` proxy, so it mattered. Upgraded to Next 16 / React 19 and re-ran everything. Result: 0 vulnerabilities in both packages; `npm audit` now runs in CI.
2. **Rejected a major upgrade that broke the build.** The AI first upgraded to NestJS 12, which is ESM-only; Jest failed with `Cannot use import statement`. Instead of converting the whole backend and test setup to ESM for no product benefit, we pinned NestJS 11.2.7, which already has the security fix.
3. **Invalid Jest config.** The AI put `testTimeout` inside a project block; Jest warned it was unknown and ignored it, which would have silently left the default 5 s timeout for container-based tests. Moved the timeout into the test helper and re-ran.
4. **Integration tests failing because sessions expire on the fixed clock.** Two tests jumped the clock 8 hours and received 401. That looked like an auth bug, but the app was behaving correctly (8-hour sessions). The AI's first draft of the tests had not accounted for it; the fix was to sign in again after moving the clock, not to weaken session expiry.
5. **Lint rule from React 19 flagged the AI's `usePolling` hook** for writing a ref during render. Rewrote it to update the ref in an effect.
6. **A misleading test title.** The AI wrote an e2e test named "an employee cannot open the front desk, a guard cannot answer for a host" that only tested the first half. Renamed it to say what it does; the second half is covered by an integration test.
7. **E2E selectors:** `getByRole('alert')` matched both the app's error text and Next's hidden route announcer. Added `data-testid="error"` instead of loosening the assertion.
8. **A bug the AI's validation missed (found by exploratory testing).** An arrival window ending before it started was accepted. Added the rule, a unit test and an integration test.
9. **Overclaiming in the AI's own plan.** While proposing the AI-usage corrections log, the AI first suggested listing the author's requirement changes (multi-tenant, superadmin, polling) as "AI corrections". It withdrew that, because they were the author's decisions, and the log now keeps the two separate.

## 6. Keeping it safe and understood

- All data is fictional (`@school.test` emails, `0917 000 000x` numbers); the exam PDF is excluded from the repository (`.gitignore`).
- Secrets: the demo database password is local-only and documented as such; no real credentials anywhere.
- Security-relevant code (auth, permission checks, state transitions, audit grants) is small and concentrated: `common/auth.ts`, `domain/visit-state.ts`, `services/visits.service.ts` (`transition`), `db/migrate.ts` (grants). These are the places to read first.
- Plain SQL instead of an ORM keeps the data access explicit and explainable.

## 7. Author's own notes (complete before submitting)

_Write here, in your own words: the parts of the code you reviewed and can explain, anything you changed by hand, and one thing you would do differently. The interview may ask you to explain any line and make a small live change; good entry points are the state machine (`domain/visit-state.ts`), the conditional update in `VisitsService.transition`, and the permission guard (`common/auth.ts`)._
