# Fixnar — notes for Claude

CMMS for F&B maintenance (18 UAE branches). Live: https://fixnar.vercel.app

## Stack
- React 18 + React Router 6, Create React App (`react-scripts build`), plain inline styles + CSS variables in `src/index.css`
- Supabase (project `haielakcqbsvtpkcszud`): Postgres + Auth + Realtime + Storage (`attachments` bucket)
- Vercel auto-deploys `main`

## Rules
- Supabase never throws: check errors with `if (error && Object.keys(error).length)`. Never call `.catch()` on a query builder.
- Lists can exceed 1000 rows: use `fetchAllRows()` from `src/lib/supabase.js`.
- Use theme CSS variables (`--surface`, `--text`, `--border`, `--green`…), never hard-coded dark colours.
- Components with inputs must be defined at module level (not inside another component) or inputs lose focus.
- Row Level Security is ON for every table. Roles: admin, operations, technician, vendor. New tables need RLS + policies.
- Database changes go in `supabase/fxNN_*.sql` and must be idempotent (`if not exists`, `create or replace`).
- Working hours 09:00–18:00, Monday–Saturday, Sunday off (Asia/Dubai). Keep `src/lib/sla.js` and SQL `sla_deadline()` / `is_workday()` in sync.
- Dispatch: auto-plan `plan_dispatch()` — valid SLA first, max 8 jobs/technician/day; manual moves set `schedule_locked`.
- Budget spend counts in the month a job is completed (`work_orders.spend_at`).
- Closing a job requires the store manager's signature (work order page).

## Before shipping
- `CI=false npx react-scripts build` must compile.
- Test database changes as each role (admin / operations / technician / vendor) inside a rolled-back transaction.
- Work through a pull request on a `claude/…` branch; the owner merges.
