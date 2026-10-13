# Decision Log

Running log of decisions made while shaping the spec (grilling session, 2026-10-13).
These feed `spec.md` (section 10, Key decisions) and `assumptions.md`.

## D1 — Stack
- **Backend:** NestJS (TypeScript)
- **Frontend:** Next.js / React
- **Database:** PostgreSQL (Docker)
- **Why:** author is most fluent in TypeScript; the interview includes a live code change.
- **To record in spec:** the stack differs from the suggested Java/Spring Boot/Angular, so the spec must briefly justify it (required by the exam). Everything still runs via Docker (`docker compose up`).

## D2 — Scope and effort
- Finish every **Must**, then most **Should**; **Could** is optional.
- Build strictly in priority order: all Musts before any Should.
- Depth in Musts (server-side rules, tests) is valued over breadth.

## D3 — Priority ranking (MoSCoW)

| Priority | Capability |
|---|---|
| Must | Employee pre-registers an expected visitor |
| Must | Front desk checks in a pre-registered visitor and issues a pass |
| Must | Front desk registers a walk-in and names the host employee |
| Must | System notifies the host in-app (email/SMS simulated) |
| Must | Host confirms or declines; pass issued only after confirmation |
| Must | Check-out with the pass; pass stops being valid |
| Must | Role-based access, enforced on the server |
| Must | User directory with roles; a permissions table assigns permissions to each role; each user is assigned a role (e.g. employee can pre-file a visit; admin/superadmin can view the overall system) |
| Should | Defined outcome when the host does not respond in time |
| Should | Live on-campus view, including overstayed visitors |
| Should | Audit trail (who did what, when) |
| Should | CI pipeline file |
| Should | QR code / printable pass |

Notes:
- The user-directory-with-permissions-table requirement was **added by the author** as a Must (not in the exam's list). It makes RBAC data-driven rather than hard-coded.
- **Multi-tenant is OUT OF SCOPE** (author decision, revised): single school only. No `school_id`, no tenant isolation. Record in the spec as a production-release item.
- QR/printable pass was **raised from Could to Should**.
- No capabilities are currently ranked Could; add any extra features of our own here.

## D4 — Roles and checkout
- The **visitor is not a user**; no login. They interact only through the pass.
- The **front desk/guard checks the visitor out** by scanning or entering the pass number.
- **Admin** has read-only access plus user management (separation of duties: admin does not perform front-desk actions).
- **No superadmin** (decided): one school, so a single **Admin** role covers "view the overall system" plus user/role management. Roles: Employee, Front Desk, Admin.

## D5 — Permissions model (option c)
- Permissions are a **fixed, seeded catalogue** defined in code (e.g. `visit:preregister`, `visit:checkin`, `visit:checkout`, `visit:view_all`, `audit:view`, `user:manage`, `role:manage`).
- **Admins can create custom roles and edit each role's permission set** in the UI (`roles`, `permissions`, `role_permissions` tables). Each user has exactly one role.
- The server checks **permissions, never role names**.
- Guardrails (proposed, to confirm): the three seeded roles are protected from deletion; the Admin role cannot lose `user:manage`/`role:manage`, so an admin cannot lock everyone out; every role/permission change is audited.
- Per-user direct grants are not built (future work).

## D6 — Visit lifecycle
- States: `PRE_REGISTERED`, `AWAITING_HOST`, `CHECKED_IN`, `CHECKED_OUT`, `DECLINED`, `EXPIRED`, `CANCELLED`, `NO_SHOW`.
- Transitions:
  - `PRE_REGISTERED → CHECKED_IN` (front desk check-in), `→ CANCELLED` (employee), `→ NO_SHOW` (not arrived by end of day)
  - `AWAITING_HOST → CHECKED_IN` (host confirms; pass issued), `→ DECLINED` (host declines), `→ EXPIRED` (host timeout)
  - `CHECKED_IN → CHECKED_OUT` (front desk check-out; pass invalidated)
- Terminal: `CHECKED_OUT`, `DECLINED`, `EXPIRED`, `CANCELLED`, `NO_SHOW`.
- **Overstay is derived** (`CHECKED_IN` and past expected end), not stored.
- A single domain state machine rejects all other transitions; each rejection is unit-tested.

## D7 — Pass identity
- A pass has a **short human-readable number** (typed by the guard) and a **random unguessable token** encoded in the QR code.
- Check-out accepts either; both resolve to the same pass, and the pass becomes invalid on check-out.
- We model the pass, not the physical lanyard; an unreturned card is not tracked (record in `assumptions.md`).

## D8 — Host and host-response timeout
- The **host** is the employee the visitor came to see. Pre-registered: the employee who pre-registered is the host. Walk-in: the guard selects the host from the employee directory.
- Hosting is a permission (`visit:host`), held by Employee by default; the server checks the permission, not the role name.
- Timeout: if the host does not confirm/decline within **N = 5 minutes (configurable)**, the visit becomes `EXPIRED`.
- One **reminder** notification is sent to the host at half the timeout.
- On expiry the guard sees a clear "no response" state and can re-register the visitor or choose another host.
- The system never admits an unconfirmed visitor. Escalation and guard override are future work.

## D9 — Expected duration and overstay
- Every visit has an **expected end time**: set at pre-registration (employee) or walk-in registration (guard); the host can adjust it (**adjusting is not built yet**; listed as future work). A default duration (2 h, configurable) is pre-filled so entering a time is optional.
- **Overstay (derived):** `CHECKED_IN` and now > expected end.
- **Closing-time sweep:** see D19 (auto-check-out at closing time).

## D10 — Visitor data and retention
- **Collected:** visitor full name, purpose of visit, host, optional contact number. **Not collected:** ID numbers, photos, vehicle plates (the guard may look at an ID without recording it).
- A short **privacy notice** is shown at registration (Data Privacy Act, RA 10173).
- **Retention:** visit records older than **1 year (configurable)** are **anonymised**: name and contact cleared; timestamps, host, purpose and status kept for statistics and audit references. Anonymisation is based on record age, not the visitor's age.
- A scheduled job performs it and writes an audit event.
- Full records are visible only to users with the relevant permission. The 1-year period is an assumption for the school's data protection officer to confirm (record in `assumptions.md`).

## D11 — Notifications
- **In-app** is the primary channel, always on.
- **Email and SMS** go through a swappable `NotificationChannel` interface with simulated implementations that write to a log table, shown on an admin-visible "sent messages" screen.
- **Channel failure:** record the failure; the in-app notification still stands; a single attempt, no retries (retries are future work).
- **Reminder:** at half the host timeout, if the host has not acted, the reminder goes out in-app and by simulated SMS (proposed with the choice, to confirm).
- The simulated channel can be made to fail via a configuration flag so the failure path is testable.

## D12 — Authentication
- Email + password for **seeded fictional users**; passwords hashed (argon2/bcrypt).
- **Server-side sessions stored in PostgreSQL**, sent as an httpOnly, SameSite cookie. Permissions are read fresh on each request, so role or permission changes and session revocation take effect immediately.
- Login attempts are **rate-limited**.
- Every endpoint enforces permissions on the server; the UI only hides what the user cannot do.
- Seeded logins per role are listed in the README (fictional data only).

## D13 — Real-time updates (revised: polling)
- Changed from SSE to **polling**: the UI asks the server every ~5 seconds (configurable) for host notifications, visit status changes and the live view.
- Polling endpoints are authenticated with the session cookie and filtered server-side by permission (a host only sees their own visits).
- Why: fewest moving parts, simplest to test end to end, and trivial load at 40–80 visitors a day. Polling sits behind a single client data hook, so SSE is a small future swap.
- Rejected: SSE (changed mind), WebSockets (more complexity than needed).

## D14 — Audit trail
- Append-only `audit_events` table: actor, action, target, timestamp, details.
- Records every visit state change, notification outcome, login, and user/role/permission change. Reads are not logged (future work).
- The application's database user has **insert and select only** on this table (no update/delete), so history cannot be altered through the app.
- Admin can view and filter it, read-only.

## D15 — No visitor profiles
- No `visitors` table: each visit stores its own visitor name and optional contact. Repeat visitors are re-entered.
- Keeps retention simple (anonymising a visit clears all personal data, no orphaned profiles).
- Future work: visitor profiles with lookup, and a do-not-admit flag (list in spec risks/future work).

## D16 — Pre-registration rules
- Employee enters: visitor name, optional contact, purpose, expected date and arrival window, expected duration.
- Date must be today or later, **up to 30 days ahead**.
- Employee can **edit or cancel until check-in** (cancel → `CANCELLED`).
- A pre-registered visitor arriving on the wrong day is treated as a **walk-in** (host confirms again).
- Out of scope (spec out-of-scope/risks): group pre-registration, recurring visitors.

## D17 — Matching at the gate
- The guard **searches today's pre-registrations by visitor name or host name** and selects the match; no match → walk-in flow.
- The search returns **only today's expected visits** (guard never sees future visitors).
- Not built: pre-registration code (b) — possible Should if time allows; QR sent to visitor (c) — needs real email/SMS.

## D18 — Host decline
- Host confirms or declines a walk-in; decline takes an **optional short reason**.
- Guard sees "Declined" plus the reason and turns the visitor away.
- `DECLINED` is terminal and not reversible; a change of mind means a **new walk-in registration**.

## D19 — Forgotten check-outs
- At a configurable **school closing time** (e.g. 6 PM), a scheduled sweep checks out everyone still `CHECKED_IN`.
- Departure time recorded = **the closing time**; `checked_out_by = system`; the record is marked **"departure unverified"**.
- Reports and the UI distinguish verified from unverified departures. The sweep writes audit events and invalidates the passes.
- Guard/admin can still check a visitor out manually earlier. Correction of an unverified time: see D20.
- Rejected: expected end time as departure (understates time on campus), blank departure time, no auto-check-out.

## D20 — Correcting an unverified departure
- A user with the correction permission (e.g. `visit:correct_departure`, held by Front Desk and Admin by default; to confirm in the permission catalogue) can enter the real departure time on a system-closed visit.
- The original system-set time and the "unverified" marker are kept in the audit trail; the visit shows "corrected by X on Y".
- Only unverified departures can be corrected; the correction must be on or after check-in and not in the future. (Proposed, to confirm.)

## D21 — Pass validity and duplicate check-in
- A pass is valid **only while its visit is `CHECKED_IN`**. It is issued at check-in (pre-registered) or at host confirmation (walk-in), never earlier.
- Closing-time sweep (D19) and manual check-out invalidate the pass. A used or stale number/token is **rejected by the server** and the attempt is audited.
- A pass is tied to one visit and one date; the printed pass shows visitor, host and date.
- **Duplicates:** the guard gets a warning when an open visit with the same visitor name and host exists today, and can continue after confirming. Same-name visitors are allowed.

## D22 — Time handling
- All timestamps stored in **UTC**. One configured school time zone, **`Asia/Manila`** (UTC+8, no DST), defines "today", closing time, the sweep and retention job; the UI shows Manila time.
- Domain code uses an **injected clock**, never the system clock directly; tests use a fixed clock to cover timeout, overstay and the closing sweep.

## D23 — Concurrency
- Every state change is a **conditional update in one transaction** (e.g. move to `CHECKED_IN` only if still `AWAITING_HOST`). First wins; the loser gets a clear "visit already changed" error.
- Timeout uses the same rule: a **late confirmation of an `EXPIRED` visit is rejected**.
- Covered by an API test firing two competing requests. Rejected: optimistic version numbers, ignoring the problem.

## D24 — Scheduled jobs and timeout application
- A **scheduled job runs every minute** and expires overdue `AWAITING_HOST` visits (D8). The same rule is also applied **on read**, so no screen shows an overdue visit as pending.
- The same job runner carries the **closing-time sweep** (D19) and the **retention anonymisation** (D10); each run writes audit events and is idempotent.
- Rejected: expiry on read only, in-memory per-visit timers (lost on restart).

## D25 — Printable pass
- A **print-friendly pass page** (browser print) shows visitor name, host, date, pass number and QR code (encodes the token, D7). Contact number is not printed.
- Check-out by **typed pass number** first; **camera QR scan** is a stretch goal on the same screen.
- Not built: emailing the pass or an arrival code to the visitor (needs an email field). Future work, with the pre-registration arrival code first.

## D26 — Front-desk screen and performance
- **One front-desk screen**: today's expected visitors with search, a "register walk-in" action, visitors awaiting the host, and the on-campus list with a check-out box.
- **Targets (documented, not benchmarked):** common actions (check-in, walk-in, check-out) in at most 3 clicks; API p95 under 300 ms at expected load (40–80 visits/day), with indexes on visit date and state.
- Not built: visitor self-service kiosk (future work; would need a visitor-facing user, which D4 excludes).

## D27 — Test strategy
- **Unit (Jest):** visit state machine (all legal and illegal transitions), timeout/overstay/closing-sweep rules with an injected clock, permission checks.
- **API/integration (real PostgreSQL via Testcontainers):** pre-registered flow, walk-in flow, 403 permission denials, concurrent confirm vs timeout, audit entries and the insert-only audit table.
- **End-to-end (Playwright):** one walk-in flow from arrival to check-out, plus one RBAC check in the UI.
- Each acceptance criterion is covered at one level only (traceability table in `test-plan.md`); no duplicate tests, no testing of framework internals.
- Shift-left: tests are written alongside each capability, in priority order.

## D28 — Repository layout and run
- Project/repo name: **`school-visit-management`** (git repo, package names, README title). The local `EXAM` folder is not renamed yet.
- Simple monorepo: `backend/` (NestJS), `frontend/` (Next.js), `e2e/` (Playwright), `docs/`; no shared-package tooling; each folder has its own `package.json` and test command.
- `docker-compose.yml` starts PostgreSQL, backend and frontend; migrations and fictional seed users (one per role) apply on startup. **`docker compose up` is the single run command**; Docker is the only prerequisite.
- CI: GitHub Actions running lint, unit, integration and e2e.
- `git init` and commit per capability, since the exam reads the history.

## D29 — AI guardrails and instruction files
- Root `CLAUDE.md`: stack, commands, architecture rules (state machine is the only place visit state changes; permissions not role names; injected clock; server-side enforcement), tests-first rule.
- Project skills in `.claude/` (two at most): a **new-capability checklist** (acceptance criteria, domain test, API test, audit event, permission, docs) and a **review-against-spec** skill.
- Guardrails: ESLint + Prettier, pre-commit hook, CI pipeline, a review pass per capability.
- `docs/ai-usage.md` keeps a running corrections log. Only genuine corrections of AI output belong in it; requirement changes made by the author are decisions, not AI errors, and are logged here instead.

## D30 — Screens per role
- **Login**; navigation shows only what the user's permissions allow (the server still enforces them).
- **Employee:** pre-register a visitor; my visitors (edit/cancel); inbox with confirm/decline for walk-ins.
- **Front desk:** the single screen from D26, plus the printable pass page.
- **Admin:** live on-campus view (with overstays), audit trail, sent-messages log, user management, role and permission management.
- The live on-campus view is also available to Front Desk via `visit:view_all`.
- Build order: login, employee, front desk (Musts); live view, audit trail (Shoulds); sent-messages log last.

## D31 — Default permission catalogue and role mapping
- Ten seeded permissions mapped to Employee, Front Desk and Admin; full table in `RBAC.md`.
- `visit:correct_departure` goes to Front Desk and Admin (guard learns real departures); Admin-only is the stricter alternative.
- Admin has no `visit:checkin`/`visit:checkout`; custom roles (D5) are the route for extra powers.



## D32 — UI feedback: toasts, inline errors, pending states and motion
- **Toasts (Sonner) report the result of one-click actions**: check-in, check-out from a table row, host confirm/decline, cancel, admin changes. **Errors the user fixes in a form stay inline** next to that form (walk-in, pre-registration, the check-out box, login, new user/role), because a toast disappears before the user has fixed the input. Error toasts stay 8 s, successes 4 s, and toasts that ask for action (a host decision at the gate, a visitor arriving for the host) 10 s.
- **The guard is told when a host answers or a request expires**, without watching the list: the front desk remembers which walk-ins were waiting, and toasts when each one appears on campus (with "Print pass") or among the declined/expired outcomes. The host gets a toast for each new request after the page loaded, and the tab title shows the waiting count, since they may be on another tab.
- **Every action shows it is in flight**: a spinner in the button, which ignores further clicks until the request ends (`usePending`), so a double click cannot send a request twice. Lists show "Loading…" until the first poll answers, so "Nobody is waiting" is never claimed before we know.
- **Connection problems are visible**: if polling cannot reach the API, a banner says the data is the last known state; a 401 during polling ends the session and returns to login (spec section 5).
- **Motion is restrained** (front-desk work is repeated many times a day): press feedback on buttons (scale 0.97, 160 ms); new rows arriving by polling fade in (220 ms, only rows that are new); the confirm dialog fades and scales in (200 ms in, 150 ms out); a slow pulse marks "waiting for host". All use one ease-out curve, animate only `transform`/`opacity`, and drop movement under `prefers-reduced-motion`. Rejected: animating tab switches, counts or admin tables (data being read), row exit animations (the toast already confirms the removal), and a per-poll refresh spinner (noise every 5 s).
- Toasts sit bottom-left because every row action is on the right.
- Rejected: a hand-built toast (Sonner already handles stacking, pausing on hover and screen-reader announcements), and toasts for form validation errors.
