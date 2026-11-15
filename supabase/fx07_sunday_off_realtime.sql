-- FIXNAR fx07 — Working week Monday–Saturday (Sunday off) + live updates on work orders
-- Applied in Supabase. Kept here for the record.
create or replace function public.is_workday(d date)
returns boolean language sql immutable as $$ select extract(isodow from d) <> 7 $$;
-- sla_deadline(): Sunday is the only non-working day (see migration fx07 in Supabase for the full body)
-- SLA deadlines of running jobs were recalculated; work_orders added to the supabase_realtime publication.
