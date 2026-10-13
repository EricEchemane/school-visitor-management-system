---
name: review-against-spec
description: Review a diff or branch of school-visit-management against the spec, decision log and architecture rules in CLAUDE.md. Use before committing a capability or when reviewing AI-written code.
---

Read `CLAUDE.md`, the relevant sections of `docs/spec.md`, and `docs/decisions.md`. Then review the diff and report only real problems, most severe first, each with the file/line and a concrete failing scenario.

Check specifically:
- Any state change that bypasses the state machine or the conditional UPDATE.
- Any endpoint missing `@RequirePermission`, or authorisation by role name, or a missing ownership check.
- Any `new Date()` / `Date.now()` in domain or service code instead of the injected clock.
- Missing audit events; audit writes outside the transaction they describe.
- Pass issued before confirmation, or still valid after check-out/sweep.
- Personal data exposed beyond need (contact number on a pass, names to users without the permission).
- Input not validated by zod, errors leaking internals, SQL built from user input.
- Behaviour that contradicts an acceptance criterion or a decision (D1–D31).
- Tests that duplicate another level, assert nothing meaningful, or would still pass if the rule were removed.
Say plainly when nothing is wrong.
