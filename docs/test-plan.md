# Test Plan

How to run: see `README.md`. Acceptance criteria (AC) are defined in `spec.md` section 3. Decisions on strategy: `decisions.md` D27.

## 1. Strategy: one level per behaviour

| Level | Tool | Used for | Why this level |
|---|---|---|---|
| Unit | Jest, no Docker | Visit state machine (every legal and illegal transition), time rules (school day, closing instant, pre-registration date window, arrival window, overstay, timeout/reminder maths), PH mobile validation | Pure rules with many cases; fast, so each case gets its own test |
| API / integration | Jest + Supertest + real PostgreSQL via Testcontainers, injected fixed clock | Both flows end to end through HTTP, permission denials, ownership, concurrency, timeouts and sweeps (via the job runner), notification failure, audit integrity (DB-level), retention, admin guards | Behaviour that depends on the database (conditional updates, grants), sessions and the whole service stack; a fixed clock makes time rules deterministic |
| End-to-end | Playwright, real browser against `docker compose` | One walk-in journey from arrival to check-out across two users and two browsers; one permission check through the UI; the check-in confirmation dialog (cancel does nothing, confirm checks in) | Proves UI, proxy, API, DB and polling work together. Kept to the minimum because browser tests are slow and fragile |

Rules followed: a rule is tested where it is cheapest to test thoroughly; higher levels only prove wiring. Where two levels touch the same AC, the unit test covers the rule logic and the integration test covers one wiring case (marked "+" below).

## 2. Traceability: acceptance criteria to tests

U = unit, I = integration, E = end-to-end. File names are under `backend/test/` and `e2e/tests/`.

| AC | Behaviour | Level and test |
|---|---|---|
| 1.1 | Pre-register creates `PRE_REGISTERED` with me as host | I `flows` › pre-registered flow |
| 1.2 | Past / too-far / malformed date rejected | U `rules` › pre-registration date; + I `flows` › rejects bad dates |
| 1.3 | Edit and cancel until check-in only | I `flows` › host can edit and cancel until check-in |
| 1.4 | Another employee cannot read or change my visit | I `flows` › edit/cancel (404 for others); I `security` › does not leak visits |
| 1.5 | Arrival window cannot end before it starts (found by exploratory testing) | U `rules` › arrival window; + I `flows` › rejects an arrival window… |
| 2.1 | Search today's expected by visitor or host | I `flows` › pre-registered flow |
| 2.2 | Check-in moves to `CHECKED_IN` and issues a pass | I `flows` › pre-registered flow; U `visit-state` |
| 2.3 | Cancelled / other day / already checked-in cannot be checked in | I `flows` › edit & cancel, wrong-day arrival, pre-registered flow (second check-in) |
| 2.4 | No match → walk-in flow | E walk-in journey (walk-in is the only path for an unknown visitor) |
| 3.1 | Walk-in starts `AWAITING_HOST`, no pass | I `flows` › walk-in flow; E walk-in journey |
| 3.2 | Duplicate open visit gives a warning, guard can continue | I `flows` › duplicate warning |
| 3.3 | Non-host or deactivated employee cannot be chosen | I `flows` › rejects a host who cannot host; I `security` › deactivated user |
| 4.1 | Host gets in-app notification and a simulated email record | I `flows` › walk-in flow; E walk-in journey (host sees the request) |
| 4.2 | Host confirms → `CHECKED_IN` and pass | I `flows` › walk-in flow; E walk-in journey |
| 4.3 | Host declines → `DECLINED`, reason visible to guard, no pass | I `flows` › declines |
| 4.4 | Only the named host can answer | I `security` › only the named host can answer |
| 4.5 | Answer after the visit changed is rejected | I `flows` › declines (late confirm); I `rules-and-jobs` › two simultaneous answers; U `visit-state` (illegal transitions) |
| 4.6 | Channel failure recorded; in-app and visit unaffected | I `rules-and-jobs` › notification failures |
| 5.1 | Check-out by number or QR token; pass invalid | I `flows` › walk-in flow (number), pre-registered flow (token); E walk-in journey |
| 5.2 | Used / unknown pass rejected and audited | I `flows` › walk-in flow; E walk-in journey (second attempt) |
| 6.1 | One reminder at half the timeout | I `rules-and-jobs` › host does not respond; U `rules` › timeout and reminder |
| 6.2 | `EXPIRED` at the timeout; guard sees "no response" | I `rules-and-jobs` › host does not respond |
| 6.3 | Late confirmation rejected, even before the job ran | I `rules-and-jobs` › applies the timeout on read |
| 7.1 | Live view lists exactly the checked-in visitors | I `flows` › walk-in flow; E walk-in journey |
| 7.2 | Overstay flagged only after expected end | U `rules` › overstay; I `rules-and-jobs` › overstay is derived |
| 7.3 | View refused without permission | I `security` › denies each role |
| 8.1 | Closing sweep: auto check-out, unverified, pass invalid, idempotent | I `rules-and-jobs` › closing-time sweep (both tests) |
| 8.2 | Departure correction rules and audit of the original | I `rules-and-jobs` › closing-time sweep |
| 8.3 | Past-date pre-registrations become `NO_SHOW` | I `rules-and-jobs` › closing-time sweep |
| 9.1 | Audit events for state changes, notifications, logins | I `flows` › walk-in flow; I `security` › audit trail; I `rules-and-jobs` › notification failures |
| 9.2 | App DB user cannot update, delete or truncate audit | I `security` › audit trail |
| 9.3 | Audit refused without permission | I `security` › denies each role |
| 10.1 | New role/user works on the next request | I `security` › a custom role takes effect immediately |
| 10.2 | Every endpoint enforces permission on the server | I `security` › requires sign-in; denies each role; E › permissions are enforced |
| 10.3 | Admin role and last admin protected | I `security` › protects the Admin role and the last admin |
| 10.4 | Login rate limit; logout and deactivation end sessions | I `security` › rate-limits; logout; deactivated user |
| 11.1 | Pass data has no contact number | I `flows` › pre-registered flow (pass endpoint) |
| 12.1 | Old visits anonymised, facts kept | I `rules-and-jobs` › data retention |

## 3. Edge cases and failure scenarios

| Scenario | Covered by |
|---|---|
| Host confirms at the same moment as the timeout / two answers at once | I simultaneous answers; I late confirm on read |
| Guard tries to admit a walk-in without the host | I guard cannot check in a walk-in; U illegal transitions |
| Visitor not found / arrives on the wrong day | I wrong-day arrival; E walk-in journey |
| Same-name visitors | I duplicate warning |
| Email/SMS provider down | I notification failures |
| Pass reused after check-out or after the closing sweep | I walk-in flow; I closing sweep |
| Visitor never checks out | I closing sweep |
| School day boundary (UTC vs Manila midnight) | U school time |
| Session expiry (found while writing tests: sessions last 8 h on the injected clock) | I tests re-login after clock jumps |
| Role changed or user deactivated mid-session | I custom role; I deactivated user |
| Admin removes own admin rights | I protects the Admin role and the last admin |
| Brute-force login | I rate limit |
| Invalid input: empty, whitespace, over-long, bad UUID, bad phone, bad window, oversize body | I validation test; exploratory session (oversize body returns 413) |
| Script or HTML in a visitor name | Exploratory session (rendered as text); React escapes by default |
| Concurrent jobs overlapping | Jobs are idempotent: I sweep re-run |

## 4. What is deliberately not automated, and why

| Not automated | Reason / how it is covered instead |
|---|---|
| Printed pass layout and browser print dialog | Visual and device-specific; checked manually (exploratory) |
| Camera QR scanning | Not built (typed number and token entry work); noted in README |
| Real email/SMS providers | Out of scope; the channel boundary and its failure path are tested |
| Performance targets (p95 < 300 ms, ≤ 3 clicks) | Documented as targets, not benchmarks, at 40–80 visits/day; the click count is checked manually |
| Cross-browser and mobile layouts | Only Chromium in CI; layout is responsive but was checked manually in one browser |
| Accessibility audit | Labels, roles and focus styles are in place; no automated a11y scan |
| Docker start-up and migrations | Exercised by the CI e2e job (`docker compose up`) and by every local run, not by a separate test |
| Retention exclusion of open visits (`anonymiseOld` skips active states) | Gap: not asserted by a test yet. Listed in README next steps |
| Framework internals (NestJS, Next.js, React) | Not our code |
| Visual regressions, load, soak and penetration tests | Out of scope for this release |

## 5. Exploratory testing notes

**Session 1: 2026-10-13, about 30 minutes, on the running `docker compose` stack with seed data.**
Charter: try to break input handling, check-out, permissions and the walk-in flow as a careless or hostile user.

| # | What I tried | Result |
|---|---|---|
| 1 | Whitespace-only visitor name | Rejected (400, "is required") |
| 2 | `<img src=x onerror=alert(1)>` as name and `<b>` as purpose | Stored as text; the UI shows the literal text, no element injected, no dialog fired |
| 3 | Unicode name (`José Ñandú 王小明`) | Accepted and displayed correctly |
| 4 | 121-character name; 200 KB body | 400 with a clear message; 413 for the large body |
| 5 | Contact `abc` | Rejected with a Philippine-mobile message |
| 6 | Check-out with ` v-0002 ` (lowercase, spaces) | Works |
| 7 | Empty code; `x' OR '1'='1` as code | 400; 404 (parameterised query, no injection) |
| 8 | Admin tries to pre-register | 403 (admin has no hosting permission) |
| 9 | Arrival window 15:00 → 09:00 | **Bug: accepted (201).** Fixed: validation on create and edit, with unit and integration tests |
| 10 | Duration 0 | Rejected (minimum 5 minutes) |
| 11 | Host answers twice | Second answer 409 "visit already changed" |
| 12 | Fetch a pass for a visit that is not checked in | 409 |

Other observations (not bugs, recorded in README limitations):
- Login rate limiting is per email, so someone could deliberately lock a colleague out for 15 minutes. A per-IP or per-IP+email key is the next step.
- A Front Desk user sees an "Admin" link (their role can view the live list). The page shows only the tabs they are permitted to use; the server enforces the rest.
- The host cannot adjust the expected end time yet (decision D9 mentioned it; not built).
- Session cookies are not `Secure` unless `COOKIE_SECURE=true`, because the demo runs over plain HTTP.
