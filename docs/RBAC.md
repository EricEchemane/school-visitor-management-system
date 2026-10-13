# Role-Based Access Control (RBAC)

Seeded permissions and default role mapping for `school-visit-management`.
Decisions: D4 (roles), D5 (permissions model), D8 (host), D20 (departure correction).

## Principles
- Permissions are a **fixed, seeded catalogue** defined in code. Admins can create **custom roles** and edit each role's permission set (`roles`, `permissions`, `role_permissions` tables). Each user has exactly one role.
- The **server checks permissions, never role names**, on every endpoint. The UI only hides what a user cannot do.
- Sessions are server-side, so role and permission changes take effect on the next request.
- The visitor is **not a user** and has no login.

## Permission catalogue and default mapping

| Permission | Employee | Front Desk | Admin |
|---|:-:|:-:|:-:|
| `visit:preregister` (create, edit, cancel own pre-registrations) | ✔ | | |
| `visit:host` (receive and answer confirmations for own visitors) | ✔ | | |
| `visit:checkin` (check in a pre-registered visitor, register a walk-in) | | ✔ | |
| `visit:checkout` | | ✔ | |
| `visit:correct_departure` (correct a system-set, unverified departure) | | ✔ | ✔ |
| `visit:view_all` (live on-campus view, all visits) | | ✔ | ✔ |
| `audit:view` | | | ✔ |
| `messages:view` (sent-messages log) | | | ✔ |
| `user:manage` | | | ✔ |
| `role:manage` | | | ✔ |

## Data scoping
- Employees see **only their own visits** (as pre-registering employee or as host).
- Front Desk sees visitor names for **today's expected visits only**, plus the live on-campus view.
- Admin has no `visit:checkin` or `visit:checkout`, so duties stay separated (D4).

## Guardrails
- The three seeded roles (Employee, Front Desk, Admin) cannot be deleted.
- The Admin role cannot lose `user:manage` or `role:manage`, so no one can lock everyone out.
- Every user, role and permission change is written to the audit trail (D14).
- An admin who wants front-desk powers gets a custom role rather than extra default permissions.

## Open points
- `visit:correct_departure` for Front Desk is a judgement call; Admin-only is the stricter alternative.
