# PENDING — agent work queue (Fixnar)

**Every upgrade starts here.** Before any new comparison or feature work, the
agent works through this list top to bottom. It updates this file in the same
PR as the work, then adds new items found during the cycle.

- The agent never merges, never pushes to `main`, and never applies
  migrations. It writes `supabase/fxNN_*.sql` and the owner applies it.
- Status: `todo` → `in PR <link>` → `done (merged <date>)`, or `blocked: <why>`.
  Keep done items for one cycle, then move them to the log at the bottom.
- Source of the backlog: `docs/MAINTENANCE_CROSSOVER.md`.

Last updated: 2026-11-16 (cycle 1)

## Needs the owner (agent cannot do)
- **Apply `supabase/fx08_sla_pause_helpers_priority.sql`** (or tell the agent "apply fx08"). It adds the SLA pause on hold, the second technician and the server-side priority guard. The app works the same before and after; the second-technician screen is built after it is applied.
- Commit the applied migrations `fx01`–`fx04` to `supabase/` (they exist only in the Supabase project). The agent can do it if given read access to that project.

## Queue (in order)

| # | Item | From | Status |
|---|---|---|---|
| 1 | Bug: SLA badge used the device clock → Dubai time + server `sla_due_at`, 9 unit tests | audit | in PR (cycle 1) |
| 2 | Pause the SLA while a work order is `on_hold` | FBOS | fx08 written; blocked: owner applies fx08 |
| 3 | Priority set from the fault; only admin may override | FBOS | app part in PR (cycle 1); server guard in fx08 |
| 4 | Duplicate warning + draft autosave on a new work order | FBOS | in PR (cycle 1) |
| 5 | Second technician on a work order: DB in fx08; then the picker, list/schedule display and `plan_dispatch` helper time | FBOS | blocked: owner applies fx08 |
| 6 | ~~Vendor scorecard~~: already existed (cycle 0 was wrong) | — | done |
| 7 | Equipment quick-add catalogue / copy another store's assets | FBOS | todo |
| 8 | Repo hygiene: stray duplicates removed, fx06 header fixed, `.gitignore` | audit | in PR (cycle 1) |
| 9 | High-value equipment transfer approval (FBOS R496) | FBOS | todo |
| 10 | Equipment image from work-order photos (FBOS R468) | FBOS | todo |
| 11 | PPM tracker on the dashboard + PPM counted only when due (FBOS R451/R506) | FBOS | todo |
| 12 | Equipment service history tab per asset | FBOS | todo |

## Log
_(done items move here)_
