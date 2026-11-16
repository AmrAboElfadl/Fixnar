# PENDING — agent work queue (Fixnar)

**Every upgrade starts here.** Before any new comparison or feature work, the
agent works through this list top to bottom. It updates this file in the same
PR as the work, then adds new items found during the cycle.

- The agent never merges, never pushes to `main`, and never applies
  migrations. It writes `supabase/fxNN_*.sql` and the owner applies it.
- Status: `todo` → `in PR <link>` → `done (merged <date>)`, or `blocked: <why>`.
  Keep done items for one cycle, then move them to the log at the bottom.
- Source of the backlog: `docs/MAINTENANCE_CROSSOVER.md`.

Last updated: 2026-11-16 (cycle 0, baseline)

## Needs the owner (agent cannot do)
- Commit the applied migrations `fx01`–`fx04` to `supabase/` (they exist only in the Supabase project). The agent can do it if given read access to that project.

## Queue (in order)

| # | Item | From | Status |
|---|---|---|---|
| 1 | **Bug: SLA clock uses the device's local time** (`src/lib/sla.js` `getHours`/`setHours`). Compute in Asia/Dubai so a phone in another time zone shows the right deadline. Add a unit test. | audit | todo |
| 2 | Pause the SLA while a work order is `on_hold`, with a stage history (FBOS `maintenance_sla_stages`) | FBOS | todo |
| 3 | Priority set from the fault; only admin may override; auto-dispatch keeps a hand-set priority | FBOS | todo |
| 4 | Duplicate warning when the same store + asset/fault is already open | FBOS | todo |
| 5 | Second technician on a work order (`helper_ids uuid[]`, RLS for helper) | FBOS | todo |
| 6 | Vendor scorecard on `/vendors` (SLA %, avg fix hours, cost) | FBOS | todo |
| 7 | Equipment quick-add catalogue / copy another store's assets | FBOS | todo |
| 8 | Repo hygiene: remove stray `src/src/pages/*` and `supabase/supabase/*` after confirming they're unused; fix the fx06 header ("Mon–Fri", superseded by fx07) | audit | todo |

## Log
_(done items move here)_
