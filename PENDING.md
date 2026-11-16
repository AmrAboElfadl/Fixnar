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
- **Apply `supabase/fx10_sla_pause_helpers_priority.sql`** (or tell the agent "apply fx10"). It adds the SLA pause on hold, the second technician and the server-side priority guard. The app works the same before and after; the second-technician screen is built after it is applied.
- Commit the applied migrations `fx01`–`fx04` to `supabase/` (they exist only in the Supabase project). The agent can do it if given read access to that project.

## Queue (in order)

| # | Item | From | Status |
|---|---|---|---|
| 1 | Bug: SLA badge used the device clock → Dubai time + server `sla_due_at`, 9 unit tests | audit | in PR (cycle 1) |
| 2 | Pause the SLA while a work order is `on_hold` | FBOS | fx10 written; blocked: owner applies fx10 |
| 3 | Priority set from the fault; only admin may override | FBOS | app part in PR (cycle 1); server guard in fx10 |
| 4 | Duplicate warning + draft autosave on a new work order | FBOS | in PR (cycle 1) |
| 5 | Second technician on a work order: DB in fx10; then the picker, list/schedule display and `plan_dispatch` helper time | FBOS | blocked: owner applies fx10 |
| 6 | ~~Vendor scorecard~~: already existed (cycle 0 was wrong) | — | done |
| 7 | Equipment quick-add catalogue / copy another store's assets | FBOS | todo |
| 8 | Repo hygiene: stray duplicates removed, fx06 header fixed, `.gitignore` | audit | in PR (cycle 1) |
| 9 | High-value equipment transfer approval (FBOS R496) | FBOS | todo |
| 10 | Equipment image from work-order photos (FBOS R468) | FBOS | todo |
| 11 | PPM tracker on the dashboard + PPM counted only when due (FBOS R451/R506) | FBOS | todo |
| 12 | Equipment service history tab per asset | FBOS | todo |
| 13 | Require at least one after-work photo to complete a job (FBOS R448); today only the summary is required | FBOS (deep analysis 11-16) | todo |
| 14 | Department on work orders (FBOS) and a store-manager booking confirmation step (`manager_review`) | FBOS | todo |
| 15 | Bulk import of work orders / PPM plan from a spreadsheet template | FBOS | todo |
| 16 | Email on a new work order + web push to phones (today: in-app bell + browser notification only) | FBOS | todo |
| 17 | Technician performance: score, first-visit fix, custom date range; Google Maps route for a technician's day with km | FBOS | todo |
| 18 | Equipment: status (needs repair / under maintenance) set from open jobs, warranty date, nameplate OCR | FBOS | todo |
| 19 | AI: draft a work order from a photo; Ask AI about maintenance ("what is overdue at Mirdif?") | FBOS | todo |
| 20 | Inspections module: checklist visits, failed equipment items → work orders, repeat failures per store (large) | FBOS | todo |
| 21 | Dashboard: Today summary; Daily ops / PPM switch; PPM counted only when due | FBOS | todo |

## Log
_(done items move here)_
