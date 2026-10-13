# School Visitor Management (`school-visit-management`)

Pre-register visitors, confirm walk-ins with the host before a pass is issued, check visitors out, and see who is on campus right now. Built for a single K-12 campus (about 150 employees, 40–80 visitors a day).

Start with `docs/spec.md`. Other documents: `docs/decisions.md` (why we chose what we chose), `docs/RBAC.md` (roles and permissions), `docs/assumptions.md`, `docs/test-plan.md`, `docs/ai-usage.md`.

## Run it

Requires **Docker** (with Compose). Nothing else.

```bash
docker compose up --build
```

- App: http://localhost:3000
- API health: http://localhost:4000/api/health

The first start creates the database, applies the schema, and loads fictional seed users and a few sample visits. Stop with `Ctrl+C`; reset all data with `docker compose down -v`.

### Seeded logins (fictional; password for all: `Passw0rd!demo`)

| Role | Email | Use it to |
|---|---|---|
| Front Desk | `frontdesk1@school.test` (also `frontdesk2@…`) | Check in, register walk-ins, check out, print passes |
| Employee | `teacher1@school.test` (Teresa Reyes), `teacher2@…` (Tomas Cruz), `teacher3@…`, `registrar@…`, `principal@…`, `counselor@…` | Pre-register visitors, confirm or decline walk-ins |
| Admin | `admin@school.test` | Live view, all visits, audit trail, sent messages, users, roles and permissions |

### Try the main flows (about 2 minutes)

1. Sign in as `frontdesk1@school.test` in one browser window and `teacher1@school.test` in another (a private window works).
2. Front desk: under **Walk-in visitor**, enter a name, pick Teresa Reyes, add a purpose, **Notify host**.
3. Teresa's page shows "Someone is at the gate for you" within about 5 seconds. Click **Confirm**.
4. Front desk: the visitor appears under **On campus now** with a pass number (e.g. `V-0003`). Click **Pass** to see the printable pass with its QR code.
5. Enter the pass number in **Check out**. The visitor leaves the list and the pass stops working.
6. As Admin, open **Audit trail** to see every step, and **Sent messages** for the simulated email.

Pre-registration: as Teresa, **Expect a visitor** for today; as the guard, search **Expected today** and **Check in**.

The demo stack uses a closing time of 23:59 Manila time, so the closing-time sweep does not check everyone out if you try it in the evening. The product default is 18:00; to see the sweep, start with `CLOSING_TIME=18:00 docker compose up --build` (it applies on first start; later, edit the `settings` table).

Seeded sample data shows an overstayed visitor and expected visitors. To see the notification-failure path, set `SIMULATE_CHANNEL_FAILURES: EMAIL` (or `SMS`, or `EMAIL,SMS`) in `docker-compose.yml` and restart; the failed attempt shows in **Sent messages** and the in-app notification still arrives.

## Test it

Needs Node 20+ (22 recommended) and Docker (integration tests start PostgreSQL with Testcontainers).

```bash
# backend: lint, unit tests (no Docker), integration tests (Docker)
cd backend && npm ci
npm run lint
npm test            # unit
npm run test:int    # integration, real PostgreSQL

# end-to-end: start the stack first, then
docker compose up --build -d
cd e2e && npm ci && npx playwright install chromium
npm test
```

Frontend: `cd frontend && npm ci && npm run lint && npm run build`.

The CI pipeline (`.github/workflows/ci.yml`) runs all of this plus `npm audit` on every push. Enable the local pre-commit hook (lint and unit tests) with `git config core.hooksPath .githooks`.

See `docs/test-plan.md` for what each test covers, what is deliberately not automated, and the exploratory testing notes.

## How it is built

```
backend/   NestJS 11 + plain SQL (pg) + zod, PostgreSQL
  src/domain/     visit state machine, time rules, permissions catalogue (pure, unit-tested)
  src/services/   visits, notifications (swappable channel interface), auth, audit, admin, jobs
  src/db/         schema.sql, migration + seed
frontend/  Next.js + React; /api is proxied to the backend so the session cookie is same-origin
e2e/       Playwright
docs/      spec, decisions, RBAC, assumptions, test plan, AI usage
```

Key ideas (details in `docs/decisions.md`):
- **One state machine** decides every visit state change; updates are conditional on the current state, so two people acting at once cannot both win.
- **Permissions, not roles**, are checked on the server. Admins can create roles and assign permissions; changes apply on the next request.
- **Pass only after confirmation**, valid only while the visit is checked in.
- **Closing-time sweep** checks out forgotten visitors, marked "unverified"; a scheduled job also expires unanswered requests and anonymises records after one year.
- **Append-only audit trail**: the application's database user can only insert and read it.
- Time is injected (`Asia/Manila`, stored in UTC), so time rules are tested without waiting.

Stack note: the exam suggests Java/Spring Boot and Angular. This uses TypeScript (NestJS and Next.js/React) because it is the author's strongest stack, so every line can be explained and changed live; the structure maps one to one (controllers/services/repositories, REST API, relational database, Docker). See `docs/spec.md` section 10.

## Known limitations

- Single school only (multi-tenancy deliberately not built).
- Email and SMS are simulated (logged and shown in the admin screen); one attempt, no retries.
- The camera QR scan at check-out is not built; the guard types the pass number (the QR encodes a token that is accepted too).
- The host cannot yet adjust a visit's expected end time.
- Updates arrive by polling (every ~5 seconds), not push.
- Login rate limiting is keyed by email only (a targeted lock-out is possible); sessions are not `Secure` unless `COOKIE_SECURE=true` (the demo runs over HTTP).
- No visitor profiles, do-not-admit list, group or recurring visits, kiosk, or physical-lanyard tracking.
- The anonymisation job's exclusion of open visits has no dedicated test yet.
- Seed data and tests are fictional. The database password in `docker-compose.yml` is for local demo only.

## What I would do next

1. Real email/SMS providers behind the existing channel interface, with retries and delivery status.
2. Escalation when a host does not answer (backup contact), and an audited guard override.
3. Camera QR scanning at check-out; pre-registration arrival code emailed to the visitor.
4. Visitor profiles and a do-not-admit list; group and recurring visits.
5. Host-adjustable expected end time; per-IP login throttling; HTTPS and `Secure` cookies; SSO with the school directory.
6. Switch polling to server-sent events behind the existing `usePolling` hook.
7. Backups, monitoring, and a data-protection-officer review of the retention period.
