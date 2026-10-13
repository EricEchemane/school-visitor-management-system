# School Visitor Management (`school-visit-management`)

Single-school visitor management: pre-registration, walk-ins confirmed by the host, passes, check-out, live on-campus view, audit trail, data-driven RBAC. Read `docs/spec.md` first, then `docs/decisions.md` (why) and `docs/RBAC.md` (permissions).

## Stack and commands
- `backend/` NestJS 11 (CommonJS), plain `pg` + SQL (no ORM), zod validation, PostgreSQL.
- `frontend/` Next.js (App Router), React, plain CSS. `/api/*` is proxied to the backend (same-origin cookie).
- `e2e/` Playwright against a running stack.
- Run everything: `docker compose up --build` (UI :3000, API :4000).
- Backend: `npm test` (unit, no Docker), `npm run test:int` (needs Docker, Testcontainers), `npm run lint`.
- E2E: stack up, then `cd e2e && npm test`.

## Architecture rules (do not break)
1. **Visit state changes only through `backend/src/domain/visit-state.ts`.** `VisitsService.transition()` builds a conditional `UPDATE ... WHERE state = ANY(legal states)` from it. Never write `UPDATE visits SET state = ...` anywhere else.
2. **Authorise by permission, never by role name.** Use `@RequirePermission(...)`; ownership checks (e.g. only the named host answers) live in the service.
3. **Time comes from the injected `Clock`.** No `new Date()` in services or domain; tests use `FixedClock`. School time zone is `Asia/Manila`; timestamps are UTC.
4. **Audit every state change, notification outcome, login and admin change** via `AuditService.record` (inside the transaction when there is one). `audit_events` is insert/select only for the app DB user.
5. **Notifications go through `NotificationChannel`.** In-app always works; email/SMS failures are recorded, never thrown.
6. **Pass is valid only while its visit is `CHECKED_IN`.** Issue it at check-in/host confirmation only.
7. **Personal data is minimal** (name, purpose, optional PH mobile). Pass pages never show the contact number. Fictional data only.
8. Overstay is derived, never stored.

## Working agreement
- Tests first, at the right level (see `docs/test-plan.md`): domain rules → unit; flows, permissions, DB behaviour → integration; one UI journey → e2e. Do not duplicate coverage across levels.
- A change is done when lint, unit, integration and (for UI changes) e2e pass and docs/decision log are updated.
- Record new assumptions in `docs/assumptions.md` and decisions in `docs/decisions.md`. Log real AI-output corrections in `docs/ai-usage.md`.
- Commit per capability with a clear message.
- Skills: `/new-capability` (checklist for adding a capability), `/review-against-spec` (review a diff against the spec).
