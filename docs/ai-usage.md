# AI Usage Notes

## 1. Tools and what they were used for

| Tool | Used for |
|---|---|
| Claude Code (CLI, Claude Sonnet 5.5) | Interviewing the author to shape the spec; drafting `spec.md`, `assumptions.md`, `RBAC.md`, `test-plan.md`, README; writing the backend, frontend, tests, Docker and CI files; running tests, audits and an exploratory session against the live stack |
| Claude Code skill `grilling` (user's personal skill) | Ran the requirements interview: one decision at a time, each with a recommended answer, until every branch of the design tree was settled |
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
| Integration tests on real PostgreSQL (30) | Permission denials, race between answer and timeout, audit table immutability at the database level, sweep/retention behaviour |
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
10. **Spec drift found in the pre-submission review.** Checking the repository against the exam brief showed that the AI-drafted `spec.md` had no API section, although the brief asks for one. Its data model listed a `version` column that was never built (and that the decision table itself rejects in favour of a conditional update). It also omitted `kind`, `duration_minutes`, `reminder_sent_at`, the departure-correction columns and `notifications.message`. The fix was to compare the spec with `schema.sql` and the controllers, and to check status codes and error shapes against the running API instead of trusting the draft. The same review found an optional `hostId` on pre-registration that no document mentioned (now recorded in A4) and added the missing retention test for open visits. That test was confirmed to fail when the state filter is removed.

## 6. Keeping it safe and understood

- All data is fictional (`@school.test` emails, `0917 000 000x` numbers); the exam PDF is excluded from the repository (`.gitignore`).
- Secrets: the demo database password is local-only and documented as such; no real credentials anywhere.
- Security-relevant code (auth, permission checks, state transitions, audit grants) is small and concentrated: `common/auth.ts`, `domain/visit-state.ts`, `services/visits.service.ts` (`transition`), `db/migrate.ts` (grants). These are the places to read first.
- Plain SQL instead of an ORM keeps the data access explicit and explainable.

## 7. Author's own notes

**How the work was split.** I made the product decisions; Claude Code wrote nearly all of the code and tests, and the first drafts of the documents. The decisions came out of the requirements interview and are recorded in `decisions.md` as I made them. The places where I overrode or changed the AI's recommendation are listed in §2. The most important ones for the design: TypeScript instead of Java/Angular; single school instead of multi-tenant; data-driven custom roles instead of fixed ones; polling instead of SSE; and building the correction path for unverified departures.

**What I checked against the running system.** I used the app in each role and asked for the changes in `8bde403`, `8811a15` and `90e5829`: the select chevron, row alignment and button wrapping, the overstay badge spacing, and confirmation dialogs before check-in and check-out. Before submitting, I had the repository reviewed against the exam brief. That review found the missing API section and the spec drift described in §5 item 10, and closed the last test gap the test plan listed.

**Where I would start a walkthrough.** For the domain rule: `backend/src/domain/visit-state.ts`, which lists every legal transition, and `VisitsService.transition`, which turns it into a conditional `UPDATE` so the first writer wins. For authorisation: the guard in `backend/src/common/auth.ts`, which allows a route if the user holds any of the listed permissions. For the database guardrail: the grants in `backend/src/db/migrate.ts`, which make `audit_events` insert/select only.

**What I would do differently.**
1. *Keep the spec in step with the code as it changes, not at the end.* The spec was written first, as the brief asks, but the API section was never added and the data model drifted during the build. Neither project skill has a step for updating spec section 6. I would add one to `new-capability` and have `review-against-spec` compare the spec with `schema.sql` and the controllers.
2. *Commit smaller.* The backend and UI each landed in one or two large commits. That is harder for a reviewer or teammate to follow than one commit per capability, which is what `CLAUDE.md` asks for.
