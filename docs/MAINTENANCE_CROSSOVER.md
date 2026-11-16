# Maintenance crossover — FBOS ⇄ Fixnar

The same file lives in both repos: `fbos-app/redesign/MAINTENANCE_CROSSOVER.md`
and `Fixnar/docs/MAINTENANCE_CROSSOVER.md`. The scheduled crossover run (1st, 10th and 20th, 02:00 Dubai)
re-reads both maintenance modules and updates this file. It then builds the
top item in each direction as a PR. A human always merges, and nothing is
deployed automatically.

**Rule (owner, 2026-11-16):** every Fixnar feature ported to FBOS goes **inside the FBOS
Maintenance module** (maintenance screens, maintenance tables, maintenance server actions).
It is never mixed into another FBOS module: no Inventory, Finance or HR coupling.

| Cycle | Date | FBOS live | Fixnar HEAD | Built this cycle |
|---|---|---|---|---|
| 0 (baseline) | 2026-11-16 | R513 (`322687f`) | `b0bdbeb` | nothing (comparison only) |
| 1 | 2026-11-16 | R513 → **R514** PR | `56d8a94` PR | FBOS: Fixnar checklist templates + picker, outsource Score. Fixnar: Dubai SLA badge, duplicate warning, admin-only priority, draft autosave, fx08 written (SLA pause, second tech, priority guard) |

---

## The two systems at a glance

| | **FBOS maintenance** (Almed Group, live) | **Fixnar CMMS** |
|---|---|---|
| Stack | One-page vanilla JS (`index.html` + `js/*.js`) · Vercel serverless (`api/proxy.js` authority layer, `api/db.js`) · Supabase reached **only by the server** (RLS deny-all) | React 18 SPA · Supabase called **from the browser** (RLS policies per role) · pg_cron jobs |
| Roles | maintenance_manager, maintenance_tech (+ outsource tag), outlet roles, owner tier, partners | admin, operations (one store), technician, vendor |
| Where rules live | Server code (proxy/db.js), with shadow-mode and kill switch before enforcing | Postgres functions, triggers and RLS (`plan_dispatch`, `stock_apply`, `budget_check`) |
| Release discipline | Numbered releases, pipeline, tests per release, PR → human merge | "Add files via upload" commits, migrations fx01–fx04 not in repo |

## Feature matrix

✅ = has it · ◐ = partial · — = missing

| Capability | FBOS | Fixnar | Notes |
|---|---|---|---|
| Ticket / work order with photos | ✅ | ✅ | |
| Category → fault → suggested priority | ✅ `ntFaultsFor`, `maintTriage` | ✅ `workOrderCategories.js` | |
| Priority set automatically, only manager may override | ✅ R490 (enforced), hand-set priority kept R493 | ◐ cycle 1: app locks it for non-admins; server guard in fx08 (not applied) | |
| Working-hours SLA clock | ✅ `maintWorkingMinutesBetween` | ✅ server `sla_deadline()` in Dubai; app badge fixed to Dubai in cycle 1 | |
| Multi-stage SLA (pause / resume / handover / vendor SLA) | ✅ `maintenance_sla_stages` | ◐ pause on hold written in fx08 (not applied) | |
| SLA breach escalation + in-app notifications | ◐ push notifications, planner escalates priority | ✅ every 10 min, notification bell | |
| Duplicate-ticket warning on create | ✅ `_ntShowDuplicate` | ✅ cycle 1 | |
| Draft autosave of a half-written ticket | ✅ `_tkDraft*` | ✅ cycle 1 | |
| AI draft from photo / nameplate OCR | ✅ `ntAIDraft`, `eqOcrNameplate` | — | AI credit currently exhausted on FBOS |
| Auto-planner (slots per technician) | ✅ `_planRun`, last start 18:00, keeps today's manual moves | ✅ `plan_dispatch()` (EDF, then breached P1→P4) | |
| Max jobs per technician per day | — | ✅ `dispatch_settings.max_per_day` | **→ FBOS** |
| Auto-assign by store link + lowest open load | ◐ routing rules | ✅ | |
| Manual move pins the job (`schedule_locked`) | ◐ today only (R507) | ✅ any day, trigger-enforced | **→ FBOS** |
| Second technician on a visit | ✅ `helper_ids` R508 | ◐ fx08 written (not applied); UI after it is applied | **→ Fixnar** |
| Travel statuses (travelling → arrived → in progress) | ◐ visit record + live board | ✅ status flow | |
| Live technician map | ✅ `getTechLiveBoard` (with consent) | ✅ `LiveMap.jsx`, `technician_locations` | FBOS asks consent, Fixnar: check |
| Manager signature to close | ✅ sign-off | ✅ signature canvas | |
| Mark-fixed needs photo / notes | ✅ R448 | ◐ "Job completion" checklist | |
| Checklists | ✅ PPM checklist per equipment category, ✗ needs a note (R489); Fixnar's templates + picker in R514 | ✅ templates for PPM and any WO | FBOS: checklist on any (non-PPM) ticket still to do |
| PPM auto-generation | ✅ every 90 days, PPM tracker, due-only counting on dashboard | ✅ daily 05:00, `earliest_date` | |
| **Spare parts used per job, stock, part cost** | — (on FBOS plan as "F3 part 2") | ✅ `parts`, `part_stock`, `stock_movements`, `parts_cost` | **→ FBOS, top candidate** |
| **Vendor quotes & invoices with approve / reject** | — | ✅ `vendor_quotes` | **→ FBOS** |
| **Vendor portal (vendor logs in, sees own jobs)** | ◐ outsource technicians only | ✅ `vendor` role | |
| Vendor scorecard | ✅ SLA %, fix hours, cost; **Score /100 in R514** | ✅ score /100 incl. first-visit fix + response time (`Vendors.jsx`) | **Correction:** cycle 0 said Fixnar lacked this; it is the richer one. FBOS still lacks first-visit fix + response (needs vendor arrival / reopen data) |
| Technician performance report | ✅ `getTechPerformance`, custom range | ◐ Analytics page | |
| **Monthly maintenance budget per store, overspend flag** | — | ✅ `budgets`, `budget_check()` | **→ FBOS** |
| Equipment registry + QR label → opens the unit | ✅ R495 `?eq=` | ✅ `/a/<id>` | |
| Equipment service history | ✅ `equipment_service_log` | ◐ via work orders | |
| High-value transfer approval | ✅ R496 (shadow) | — | |
| Equipment image from ticket photos | ✅ R468 | — | |
| Quick-add equipment catalogue / copy another outlet | ✅ R467 | — | **→ Fixnar** |
| Inspection failures → tickets; repeat failures per outlet | ✅ R497/R498 | — | **→ Fixnar** (needs an inspection module) |
| Live updates without refresh | ◐ 5-minute polling | ✅ Supabase realtime (fx07) | **→ FBOS** (server-mediated) |
| Printable work-order report | ◐ exports | ✅ `/work-orders/:id/report` | |
| Audit trail | ✅ activity log, date range | ✅ `audit_log` | |
| Tests and release gate | ✅ unit + Playwright per release | ◐ first unit test (`sla.test.js`) in cycle 1 | **→ Fixnar** |
| AI asset identification + market value | ◐ AI equipment detect, nameplate OCR | ✅ `ai_identified`, `market_price_*`, `asset_market_value()` | **→ FBOS** (found in cycle 1, live DB only) |
| Budget overspend flag on the job | — | ✅ `budget_check()` trigger + `spend_at` | **→ FBOS** (with budgets) |

## Cross-improvement backlog (ranked)

### Fixnar → FBOS
1. **Spare parts consumed per ticket**: a maintenance-only parts list, stock per outlet or warehouse, cost rolled into the ticket. This matches FBOS's planned F3 part 2. **Kept inside Maintenance** (owner's rule): its own `maintenance_parts` / `maintenance_part_moves` tables, NOT the Inventory module. *Needs DDL → Jad approves.*
2. **Vendor quotes and invoices on a ticket**, approved by the maintenance manager (R147 authority check, shadow first).
3. **Daily cap per technician** in `maintenance_planner` settings (`max_per_day`, default off = today's behaviour).
4. **Pin manual moves on any day** (FBOS keeps only today's). Use a `schedule_locked`-style flag; R493's `priority_manual_at` is the pattern.
5. **Maintenance budget per outlet per month**, flag when parts + vendor cost passes it. Depends on 1 and 2.
6. ~~Fixnar's checklist templates~~: **done in R514** (PR). Next: a checklist on any repair ticket, not only PPM.
8. Vendor first-visit fix + response time (needs vendor arrival / reopen data on maintenance tickets).
9. AI asset identification with market value on equipment.
7. Faster updates: a short server poll or SSE for the open ticket and calendar (no browser → Supabase).

### FBOS → Fixnar
1. ~~Fix the SLA clock to Asia/Dubai~~: **done** (cycle 1 PR); the badge also uses the server's `sla_due_at`.
2. **SLA pause on `on_hold`** with a stage history, like FBOS `maintenance_sla_stages`.
3. **Priority set from the fault, only admin may override**: app part done (cycle 1); server guard in fx08.
4. ~~Duplicate warning~~: **done** (cycle 1). Also done: draft autosave.
5. **Second technician** on a work order (`helper_ids uuid[]`, RLS: helper may read and update).
6. ~~Vendor scorecard~~: already existed (correction).
7. **Equipment quick-add catalogue / copy another store's assets.**
8. Repo hygiene: ~~stray duplicates~~, ~~fx06 header~~, ~~first unit test~~ done (cycle 1); still to do: commit `fx01`–`fx04`.
9. **Planner keeps helper time** (once fx08 is applied): `plan_dispatch()` must not book a helper twice.

## Rules for the crossover run
- Port the **idea**, not the code. The architectures differ: FBOS rules go on the server, Fixnar rules go in Postgres functions and RLS.
- FBOS work follows `CLAUDE.md` exactly: pipeline, one concern per release, shadow first, a PR to `main`, never merge. DDL is written but applied only on Jad's OK.
- Fixnar work goes on a branch with a PR to `main`, never merged. Migrations are written as `supabase/fxNN_*.sql` and never applied by the agent.
- At most **one item per direction per cycle**. An item stays in the backlog until its PR is merged; mark it ~~struck~~ with the PR link.
