---
name: new-capability
description: Checklist for adding or changing a capability in school-visit-management so spec, rules, tests, audit and docs stay in step. Use before implementing any new visit behaviour, permission or screen.
---

Work through these in order; do not skip a step, say explicitly if it does not apply.

1. **Spec**: find or write the user story and Given/When/Then acceptance criteria in `docs/spec.md` (give them an AC id). Note any new assumption in `docs/assumptions.md`.
2. **Priority**: Must / Should / Could per spec section 12. Finish Musts first.
3. **Domain rule**: if a visit state or time rule changes, change `domain/visit-state.ts` or `domain/rules.ts` first and add unit tests, including the rejected cases.
4. **Permission**: reuse a permission from `docs/RBAC.md` or add one (catalogue in `domain/permissions.ts`, default mapping, RBAC.md). Enforce on the server with `@RequirePermission`; add ownership checks in the service.
5. **Audit**: add an `AuditService.record` call for every state change or admin action.
6. **Notification**: if people must be told, go through `NotificationService`; decide what happens when a channel fails.
7. **API test**: integration test for the happy path, the permission denial (403/404) and the conflict/validation cases.
8. **UI**: smallest screen change; use `data-testid` for e2e hooks; the server still enforces everything the UI hides.
9. **Traceability**: add the AC to the table in `docs/test-plan.md` with exactly one covering level.
10. **Verify**: lint, unit, integration (and e2e if UI changed) all green; commit with a clear message.
