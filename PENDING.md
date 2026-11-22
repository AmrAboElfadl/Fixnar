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
- ~~Apply fx10~~ **done 2026-11-16** (owner: "apply fx10"). Verified: 3 columns, 2 triggers, policies; 15 role checks in a rolled-back transaction all passed; existing 15 jobs unchanged.
- Commit the applied migrations `fx01`–`fx04` to `supabase/` (they exist only in the Supabase project). The agent can do it if given read access to that project.

## Queue (in order)

| # | Item | From | Status |
|---|---|---|---|
| 1 | Bug: SLA badge used the device clock → Dubai time + server `sla_due_at`, 9 unit tests | audit | in PR (cycle 1) |
| 2 | Pause the SLA while a work order is `on_hold` | FBOS | done (fx10 applied 11-16); next: show paused time on the job |
| 3 | Priority set from the fault; only admin may override | FBOS | done: database guard (fx10) + all three screens (new job, Assign & edit, store page) |
| 4 | Duplicate warning + draft autosave on a new work order | FBOS | in PR (cycle 1) |
| 5 | Second technician screens: picker on Assign & edit, header, list "A + B", dispatch board helper chip (not draggable), My Schedule includes helping jobs (falls back on a workspace DB without helper_ids) | FBOS | in PR (#20) |
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
| 22 | Style (owner, 11-19): DM Sans actually loaded; light-theme colours pass WCAG AA; new **Professional (Salesforce-style)** theme; 30 hard-coded greens on buttons/text now follow the theme | market review | in PR |
| 23 | Remaining hard-coded colours: priority chips (P2 amber 2.2:1), Analytics/LiveMap chart colours, logo gradients; dark theme white-on-green buttons 3.4:1 | market review | todo |
| 24 | Market gaps (top-50 CMMS review 11-19): fridge/freezer temperature sensors + alerts; offline mobile work orders; report a fault by QR without signing in; meter-based PM; downtime / MTTR / MTBF | market review | todo |
| 25 | Auto-plan (`plan_dispatch()`) should count the helper's time too, so a helper is never double-booked (needs a fxNN migration) | FBOS | todo |
| 26 | Workspaces: apply the same migrations (fx10 …) to every workspace database (Wahat Al Hayat is paused as of 11-19; 'heja' project exists but is not in workspaces.js on main) | owner | todo |
| 27 | **AI predictive maintenance** (owner, 11-22): fx19 applied (ships OFF); /predictive screen, readings on work orders, AI advice | owner request | in PR |
| 28 | Deploy the asset-ai function update (new 'advise' action) after the predictive PR merges | owner | todo |
| 29 | Sensors: pick wireless temperature (walk-ins / freezers) and current / vibration sensors; then a sensor intake endpoint (readings source 'sensor') | owner + agent | todo |
| 30 | **AI energy management** (owner, 11-22) | owner request | todo (next PR) |
| 31 | **AI inspections** (owner, 11-22) | owner request | todo |

## Log
_(done items move here)_
