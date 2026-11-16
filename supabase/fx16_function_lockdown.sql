-- fx16: lock down database functions (idempotent; same result on Fixnar and Wahat)
-- * Nobody signed-out (anon) can call any public function.
-- * Trigger functions can't be called directly by anyone (triggers still fire — EXECUTE is only checked when a trigger is created).
-- * Signed-in users can call only the functions the app / RLS policies need. Internal helpers
--   (plan_dispatch, notify_users, generate_ppm_work_orders, check_sla_breaches, wo_watchers, store_month_spend)
--   are reachable only through their guarded wrappers, triggers or cron.
do $$
declare f record;
  allow text[] := array['add_checklist','add_working_minutes','can_see_store','create_user_with_role','delete_user_account',
    'fin_acct','fin_check_lock','fin_next_number','fin_post_invoice','fin_trial_balance','fin_unpost','get_my_role','get_my_store',
    'is_admin','is_staff','is_workday','link_vendor_user','my_role','my_store_ids','my_vendor_id','ppm_interval',
    'run_auto_dispatch','run_ppm_generator','sla_deadline','store_id_from_path','working_minutes_between'];
begin
  for f in select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as trg
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    if not f.trg and f.proname = any(allow) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.trg or not (f.proname = any(allow)) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;

-- New functions are no longer callable by signed-out users by default
alter default privileges in schema public revoke execute on functions from anon;

-- Fixed search_path (advisor 0011)
alter function public.store_id_from_path(text) set search_path = public;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'is_workday' and pronamespace = 'public'::regnamespace) then
    execute 'alter function public.is_workday(date) set search_path = public'; end if;
  if exists (select 1 from pg_proc where proname = 'ppm_interval' and pronamespace = 'public'::regnamespace) then
    execute 'alter function public.ppm_interval(public.ppm_tasks) set search_path = public'; end if;
end $$;
