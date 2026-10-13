# Assumptions and Resolved Questions

Each item: what we decided, why, and the impact if it is wrong. Decision IDs refer to `decisions.md`.

| # | Question / assumption | Decision and reasoning | Impact if wrong |
|---|---|---|---|
| A1 | Who are the users? | Employees, front-desk guards and admins; visitors are not users (D4) | A visitor-facing flow (kiosk, self check-out) would need a new auth model |
| A2 | Who checks visitors out? | The guard, by typed pass number or QR (D4, D25) | Visitors who leave via another gate cannot be checked out until closing sweep |
| A3 | One school or many? | One campus, ~150 employees, 40–80 visitors/day | Multi-tenant would need a `school_id` on all data |
| A4 | What counts as the host? | The named employee; for pre-registration, the employee who registers (D8). The API accepts an optional `hostId` for registering on someone's behalf (the registrant keeps access as creator), but the UI does not offer it and it is not covered by a dedicated test | Assistants registering for a boss would need a "host on behalf" field |
| A5 | When is the pass issued? | Only at check-in (pre-registered) or host confirmation (walk-in) (D21) | Early passes would allow entry before confirmation |
| A6 | How long does the host have to answer? | 5 minutes, configurable, one reminder at half (D8) | Too short causes false expiries; too long keeps visitors waiting |
| A7 | What happens when the host does not answer? | Visit expires; guard re-registers; no override (D8) | Schools wanting a guard override need a new permission and audit rules |
| A8 | When is a visitor "overstayed"? | Still checked in after the expected end time; default 2 hours (D9) | Wrong defaults flood the live view with flags |
| A9 | Visitors who forget to check out | Closing-time sweep, closing time as departure, marked unverified (D19) | Reports mixing assumed and real times mislead; hence the marker |
| A10 | Closing time | A single configurable time (default 6 PM Manila) | Evening events keep visitors past closing and get swept early |
| A11 | Can unverified departures be corrected? | Yes, by Front Desk or Admin, with audit (D20) | Without it the record stays permanently approximate |
| A12 | What personal data is collected? | Name, purpose, host, optional contact; no ID numbers or photos (D10) | A school needing ID capture must add fields and stronger controls |
| A13 | Retention | Anonymise after 1 year, configurable; to be confirmed by the school's data protection officer (D10) | Too short loses history; too long breaches the storage-limitation principle |
| A14 | Time zone | UTC storage, `Asia/Manila` display and day boundaries (D22) | Multi-zone use would need per-user zones |
| A15 | Notifications | In-app plus simulated email/SMS, single attempt, no retries (D11) | Real providers need retries, delivery status and cost handling |
| A16 | Authentication | Seeded fictional users, passwords, server-side sessions of 8 hours (D12) | SSO with the school directory is a production need |
| A17 | Real-time updates | Polling about every 5 seconds (D13) | Higher scale or instant feel would need SSE or WebSockets |
| A18 | Audit scope | State changes, notification outcomes, logins, user/role/permission changes; no read logging (D14) | A regulator asking "who viewed this visitor" cannot be answered |
| A19 | Repeat visitors | No profiles; each visit stands alone (D15) | Guards retype details; no do-not-admit list |
| A20 | Pre-registration window | Today to 30 days ahead; editable until check-in; wrong-day arrival is a walk-in (D16) | Long-range events need other limits |
| A21 | Matching at the gate | Name search over today's expected visits (D17) | With many same-name visitors a code would be faster |
| A22 | Decline | Terminal, optional reason; retry is a new registration (D18) | Hosts changing their mind cause a second registration |
| A23 | Physical lanyard | Not tracked; we model the digital pass (D7) | An unreturned card is invisible to the system |
| A24 | Duplicate check-in | Warning, not a block, because same-name visitors exist (D21) | Accidental duplicates are possible if the guard ignores the warning |
| A25 | Concurrency | Conditional update, first writer wins (D23) | Without it, a late confirm could resurrect an expired visit |
| A26 | Permission model | Fixed catalogue, custom roles, one role per user (D5, D31) | Users needing two roles must use a combined custom role |
| A27 | Contact number format | Optional, validated as a Philippine mobile number | Foreign visitors would need a looser rule |
| A28 | Purpose of visit | Free text, up to 200 characters | Reporting by purpose would need a fixed list |
| A29 | Deactivated employees | Cannot log in or be chosen as host; history kept | Reassigning open visits would need a workflow |
| A30 | Performance target | p95 < 300 ms and ≤ 3 clicks, documented not benchmarked (D26) | A busy gate may need real load testing |
| A31 | Data is fictional | All seed and test data is invented | n/a |
