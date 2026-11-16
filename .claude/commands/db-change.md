---
description: Make a safe Supabase database change (migration file + RLS + role tests)
argument-hint: [what the change should do]
---
Database change requested: $ARGUMENTS

1. Inspect the current tables, columns, policies and triggers involved before changing anything.
2. Write the SQL as `supabase/fxNN_<name>.sql` (next free number). It must be idempotent: `if not exists`, `create or replace`, `drop policy if exists`.
3. Every new table: `enable row level security` + policies for admin / operations / technician / vendor. Revoke EXECUTE on trigger functions from public, anon, authenticated.
4. Times are Asia/Dubai, working hours 09:00–18:00 Monday–Saturday, Sunday off.
5. If the Supabase MCP is connected: apply it, then test as each role inside a transaction that is rolled back (set `request.jwt.claims` + `set local role authenticated`), and report what each role can and cannot do.
6. Update any frontend code that uses the changed tables, then run /check.
