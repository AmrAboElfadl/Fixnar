-- FIXNAR fx08 — ported from FBOS (crossover cycle 1, 2026-11-16)
-- NOT APPLIED. The owner reviews and applies it (Supabase → SQL editor, or tells the agent "apply fx08").
-- Additive: new columns have defaults, existing rows keep working; the app runs the same before and after.
--
--  1. SLA pauses while a job is On hold (FBOS maintenance_sla_stages idea): the paused working time is
--     added to sla_due_at when the job leaves On hold; breach checks skip On-hold jobs.
--  2. Second technician on a job (FBOS R508): helper_ids uuid[]; a helper may read and update like the
--     assigned technician; only admin / operations may change who helps.
--  3. Priority is set from the fault; only an admin may change it afterwards (FBOS R490). Vendors were
--     already blocked by wo_vendor_guard.

begin;

-- ── columns ─────────────────────────────────────────────────────────────────
alter table public.work_orders add column if not exists sla_paused_at      timestamptz;
alter table public.work_orders add column if not exists sla_paused_minutes numeric not null default 0;
alter table public.work_orders add column if not exists helper_ids         uuid[]  not null default '{}';
create index if not exists work_orders_helper_ids_gin on public.work_orders using gin (helper_ids);

-- ── working-time helpers (Dubai, Mon–Sat 09:00–18:00, same rules as sla_deadline) ──
create or replace function public.working_minutes_between(p_from timestamptz, p_to timestamptz)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  cur timestamp := p_from at time zone 'Asia/Dubai';
  fin timestamp := p_to   at time zone 'Asia/Dubai';
  day_start timestamp; day_end timestamp; a timestamp; b timestamp;
  total numeric := 0; guard int := 0;
begin
  if p_from is null or p_to is null or p_to <= p_from then return 0; end if;
  while cur < fin and guard < 4000 loop
    guard := guard + 1;
    if extract(isodow from cur) <> 7 then
      day_start := date_trunc('day', cur) + interval '9 hours';
      day_end   := date_trunc('day', cur) + interval '18 hours';
      a := greatest(cur, day_start); b := least(fin, day_end);
      if b > a then total := total + extract(epoch from (b - a)) / 60; end if;
    end if;
    cur := date_trunc('day', cur) + interval '1 day';
  end loop;
  return total;
end $$;

create or replace function public.add_working_minutes(p_start timestamptz, p_mins numeric)
returns timestamptz language plpgsql immutable set search_path = public as $$
declare
  mins numeric := coalesce(p_mins, 0);
  cur timestamp := p_start at time zone 'Asia/Dubai';
  day_end timestamp; avail numeric; guard int := 0;
begin
  if p_start is null then return null; end if;
  if mins <= 0 then return p_start; end if;
  loop
    guard := guard + 1;
    exit when guard > 4000;
    if extract(isodow from cur) = 7 then cur := date_trunc('day', cur) + interval '1 day' + interval '9 hours'; continue; end if;
    if cur::time < time '09:00' then cur := date_trunc('day', cur) + interval '9 hours'; end if;
    if cur::time >= time '18:00' then cur := date_trunc('day', cur) + interval '1 day' + interval '9 hours'; continue; end if;
    day_end := date_trunc('day', cur) + interval '18 hours';
    avail := extract(epoch from (day_end - cur)) / 60;
    if mins <= avail then return (cur + make_interval(secs => mins * 60)) at time zone 'Asia/Dubai'; end if;
    mins := mins - avail;
    cur := date_trunc('day', cur) + interval '1 day' + interval '9 hours';
  end loop;
  return p_start;
end $$;

-- ── 1. SLA pause on hold ────────────────────────────────────────────────────
create or replace function public.wo_sla_pause()
returns trigger language plpgsql set search_path = public as $$
declare m numeric;
begin
  if new.status = 'on_hold' and old.status is distinct from 'on_hold' then
    new.sla_paused_at := now();
  elsif old.status = 'on_hold' and new.status is distinct from 'on_hold' and old.sla_paused_at is not null then
    m := public.working_minutes_between(old.sla_paused_at, now());
    new.sla_paused_minutes := coalesce(old.sla_paused_minutes, 0) + m;
    if new.sla_due_at is not null and new.sla_breached_at is null then
      new.sla_due_at := public.add_working_minutes(new.sla_due_at, m);
    end if;
    new.sla_paused_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_wo_sla_pause on public.work_orders;
create trigger trg_wo_sla_pause before update of status on public.work_orders
  for each row execute function public.wo_sla_pause();

-- A priority change keeps the time already spent on hold
create or replace function public.wo_set_sla()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.sla_due_at := public.add_working_minutes(
      public.sla_deadline(new.priority, coalesce(new.created_at, now())),
      coalesce(new.sla_paused_minutes, 0));
    new.sla_breached_at := null;
  end if;
  return new;
end $$;

-- Breach check skips jobs that are on hold (body as live, plus the on_hold filter)
create or replace function public.check_sla_breaches()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select w.*, s.name store_name from public.work_orders w left join public.stores s on s.id = w.store_id
    where w.status not in ('completed','closed','on_hold') and coalesce(w.migrated,false) = false
      and w.sla_due_at is not null and w.sla_due_at < now() and w.sla_breached_at is null
  loop
    update public.work_orders set sla_breached_at = now() where id = r.id;
    insert into public.notifications(user_id, type, title, body, link, work_order_id)
    select distinct u, 'sla_breach', '🔴 SLA breached — '||coalesce(r.store_name,''),
           r.priority||' · '||r.title||' (due '||to_char(r.sla_due_at at time zone 'Asia/Dubai','DD Mon HH24:MI')||')',
           '/work-orders/'||r.id, r.id
    from unnest(array(select public.wo_watchers(r.store_id)) || r.assigned_to || r.helper_ids) u where u is not null;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── 2 + 3. Guard: priority (admin only) and helpers (admin / operations only) ──
create or replace function public.wo_priority_helper_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.priority is distinct from old.priority and not public.is_admin() then
      raise exception 'Only an admin can change the priority';
    end if;
    if new.helper_ids is distinct from old.helper_ids and not public.is_staff() then
      raise exception 'Only an admin or operations can change the second technician';
    end if;
  end if;
  if array_length(new.helper_ids, 1) > 2 then raise exception 'At most two helpers on a job'; end if;
  if new.assigned_to is not null and new.assigned_to = any(new.helper_ids) then
    new.helper_ids := array_remove(new.helper_ids, new.assigned_to);
  end if;
  return new;
end $$;
drop trigger if exists trg_wo_priority_helper_guard on public.work_orders;
create trigger trg_wo_priority_helper_guard before update on public.work_orders
  for each row execute function public.wo_priority_helper_guard();

-- Helpers see and update the job like the assigned technician (policies as live + helper clause)
drop policy if exists fx_wo_read on public.work_orders;
create policy fx_wo_read on public.work_orders for select using (
  public.is_admin()
  or (public.my_role() = 'operations' and public.can_see_store(store_id))
  or (public.my_role() = 'technician' and (assigned_to = auth.uid() or auth.uid() = any(helper_ids) or public.can_see_store(store_id)))
  or (public.my_role() = 'vendor' and vendor_id is not null and vendor_id = public.my_vendor_id())
);
drop policy if exists fx_wo_update on public.work_orders;
create policy fx_wo_update on public.work_orders for update using (
  public.is_admin()
  or (public.my_role() = 'operations' and public.can_see_store(store_id))
  or (public.my_role() = 'technician' and (assigned_to = auth.uid() or auth.uid() = any(helper_ids)))
  or (public.my_role() = 'vendor' and vendor_id is not null and vendor_id = public.my_vendor_id())
) with check (
  public.is_admin()
  or (public.my_role() = 'operations' and public.can_see_store(store_id))
  or (public.my_role() = 'technician' and (assigned_to = auth.uid() or auth.uid() = any(helper_ids)))
  or (public.my_role() = 'vendor' and vendor_id is not null and vendor_id = public.my_vendor_id())
);

commit;

-- Verify (read-only) after applying:
--   select column_name from information_schema.columns where table_name='work_orders' and column_name in ('sla_paused_at','sla_paused_minutes','helper_ids');
--   select public.working_minutes_between('2026-11-16 12:00+00','2026-11-17 06:00+00');  -- 180
--   select public.add_working_minutes('2026-11-16 12:00+00', 240);                         -- 2026-11-17 07:00+00
-- Rollback: drop the two triggers, restore wo_set_sla / check_sla_breaches / both policies from fx07 state.
