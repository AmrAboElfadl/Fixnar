-- FIXNAR fx06 — Automatic daily dispatch plan per technician
-- Rules: working hours 09:00–18:00 (Mon–Fri, Dubai), max 8 work orders per technician per day,
-- jobs whose SLA is still valid go first (earliest deadline first), then already-breached jobs
-- (P1→P4, oldest first). Jobs already started stay on today. Manually placed jobs are kept (schedule_locked).

alter table public.work_orders add column if not exists schedule_locked boolean not null default false;
alter table public.work_orders add column if not exists earliest_date date;      -- PPM: not before due date
alter table public.work_orders add column if not exists auto_scheduled_at timestamptz;

create table if not exists public.dispatch_settings (
  id             int primary key default 1 check (id = 1),
  day_start      time not null default '09:00',
  day_end        time not null default '18:00',
  max_per_day    int  not null default 8,
  auto_assign    boolean not null default true,
  updated_at     timestamptz not null default now()
);
insert into public.dispatch_settings(id) values (1) on conflict do nothing;
alter table public.dispatch_settings enable row level security;
drop policy if exists fx_ds_read on public.dispatch_settings;
drop policy if exists fx_ds_write on public.dispatch_settings;
create policy fx_ds_read  on public.dispatch_settings for select to authenticated using (true);
create policy fx_ds_write on public.dispatch_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_workday(d date)
returns boolean language sql immutable as $$ select extract(isodow from d) not in (6, 7) $$;

create or replace function public.plan_dispatch()
returns int language plpgsql security definer set search_path = public as $$
declare
  cfg public.dispatch_settings;
  now_local timestamp := now() at time zone 'Asia/Dubai';
  today date := (now() at time zone 'Asia/Dubai')::date;
  start_min int; end_min int; first_min int;
  t record; w record; tech uuid;
  d date; cur int; cnt int; dur int; busy_end int; guard int;
  placed int := 0;
begin
  perform set_config('fixnar.auto_plan', 'on', true);   -- tells the lock trigger these moves are automatic
  select * into cfg from public.dispatch_settings where id = 1;
  start_min := extract(hour from cfg.day_start) * 60 + extract(minute from cfg.day_start);
  end_min   := extract(hour from cfg.day_end)   * 60 + extract(minute from cfg.day_end);

  -- first usable slot today (rounded up to the next 30 minutes)
  first_min := greatest(start_min, (ceil((extract(hour from now_local) * 60 + extract(minute from now_local)) / 30.0) * 30)::int);

  -- 1. Auto-assign open jobs that have no technician and no vendor
  if cfg.auto_assign then
    for w in
      select wo.id, wo.store_id from public.work_orders wo
      where wo.status = 'open' and wo.assigned_to is null and wo.vendor_id is null
        and coalesce(wo.migrated, false) = false
    loop
      select p.id into tech
      from public.profiles p
      where p.role = 'technician'
      order by
        (exists (select 1 from public.store_technician_assignments a where a.technician_id = p.id and a.store_id = w.store_id)
         or p.store_id = w.store_id) desc,
        (select count(*) from public.work_orders x where x.assigned_to = p.id and x.status not in ('completed','closed')) asc,
        p.full_name
      limit 1;
      if tech is not null then
        update public.work_orders set assigned_to = tech where id = w.id;
      end if;
    end loop;
  end if;

  -- 2. Plan each technician
  for t in select id from public.profiles where role = 'technician' loop

    -- forget previous automatic plan for jobs not started yet
    update public.work_orders set scheduled_date = null, scheduled_time = null
     where assigned_to = t.id and status = 'open' and not schedule_locked
       and coalesce(migrated, false) = false;

    -- jobs already started stay on today, at their current time or "now"
    update public.work_orders
       set scheduled_date = today,
           scheduled_time = coalesce(case when scheduled_date = today then scheduled_time end,
                                     make_time(least(first_min, end_min - 30) / 60, least(first_min, end_min - 30) % 60, 0))
     where assigned_to = t.id and status in ('travelling','arrived','in_progress')
       and not schedule_locked and coalesce(migrated, false) = false;

    for w in
      select wo.id, wo.duration_hours, wo.earliest_date
      from public.work_orders wo
      where wo.assigned_to = t.id and wo.status = 'open' and not wo.schedule_locked
        and coalesce(wo.migrated, false) = false
      order by
        (wo.sla_due_at is not null and wo.sla_due_at >= now()) desc,          -- valid SLA first
        case when wo.sla_due_at >= now() then wo.sla_due_at end asc nulls last, -- nearest deadline first
        wo.priority asc, wo.created_at asc
    loop
      dur := greatest(30, least(end_min - start_min, round(coalesce(nullif(w.duration_hours, 0), 1) * 60)::int));
      guard := 0;
      d := today; cur := null;      -- each job takes the earliest free slot, in priority order
      loop
        guard := guard + 1;
        exit when guard > 3000;
        -- move to a valid working day
        if not public.is_workday(d) or (w.earliest_date is not null and d < w.earliest_date) then
          d := greatest(d + 1, coalesce(w.earliest_date, d + 1)); cur := null; continue;
        end if;
        if cur is null then
          cur := case when d = today then first_min else start_min end;
        end if;
        if cur >= end_min then d := d + 1; cur := null; continue; end if;

        -- jobs already on this day for this technician (started, locked, or planned in this run)
        select count(*) into cnt from public.work_orders
         where assigned_to = t.id and scheduled_date = d and status not in ('completed','closed')
           and coalesce(migrated, false) = false;
        if cnt >= cfg.max_per_day then d := d + 1; cur := null; continue; end if;

        -- skip past any booked block overlapping [cur, cur+dur)
        select max(extract(hour from scheduled_time) * 60 + extract(minute from scheduled_time)
                   + round(coalesce(nullif(duration_hours, 0), 1) * 60))::int
          into busy_end
          from public.work_orders
         where assigned_to = t.id and scheduled_date = d and scheduled_time is not null and id <> w.id
           and status not in ('completed','closed') and coalesce(migrated, false) = false
           and (extract(hour from scheduled_time) * 60 + extract(minute from scheduled_time)) < cur + dur
           and (extract(hour from scheduled_time) * 60 + extract(minute from scheduled_time)
                + round(coalesce(nullif(duration_hours, 0), 1) * 60)) > cur;
        if busy_end is not null then cur := busy_end; continue; end if;

        if cur + dur > end_min then d := d + 1; cur := null; continue; end if;

        update public.work_orders
           set scheduled_date = d, scheduled_time = make_time(cur / 60, cur % 60, 0), auto_scheduled_at = now()
         where id = w.id;
        placed := placed + 1;
        cur := cur + dur;
        exit;
      end loop;
    end loop;
  end loop;
  perform set_config('fixnar.auto_plan', 'off', true);
  return placed;
end $$;

create or replace function public.run_auto_dispatch()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only admin or operations can re-plan the dispatch board'; end if;
  return public.plan_dispatch();
end $$;

-- Re-plan whenever new work orders arrive (once per insert statement)
create or replace function public.wo_after_insert_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where coalesce(migrated, false) = false and status = 'open' and vendor_id is null) then
    perform public.plan_dispatch();
  end if;
  return null;
end $$;
drop trigger if exists trg_wo_plan on public.work_orders;
create trigger trg_wo_plan after insert on public.work_orders
  referencing new table as new_rows for each statement execute function public.wo_after_insert_plan();

-- Manual moves on the board pin the job (auto plan won't move it)
create or replace function public.wo_lock_manual_schedule()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('fixnar.auto_plan', true), 'off') <> 'on'
     and auth.uid() is not null
     and new.scheduled_date is not null
     and (new.scheduled_date is distinct from old.scheduled_date or new.scheduled_time is distinct from old.scheduled_time) then
    new.schedule_locked := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_wo_lock_manual on public.work_orders;
create trigger trg_wo_lock_manual before update of scheduled_date, scheduled_time on public.work_orders
  for each row execute function public.wo_lock_manual_schedule();

-- PPM work orders: not before their due date
create or replace function public.wo_ppm_earliest()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.wo_type = 'ppm' and new.earliest_date is null then new.earliest_date := new.scheduled_date; end if;
  return new;
end $$;
drop trigger if exists trg_wo_ppm_earliest on public.work_orders;
create trigger trg_wo_ppm_earliest before insert on public.work_orders
  for each row execute function public.wo_ppm_earliest();

select cron.unschedule(jobid) from cron.job where jobname = 'fixnar_auto_dispatch';
select cron.schedule('fixnar_auto_dispatch', '15 1 * * *', $$select public.plan_dispatch()$$);   -- 05:15 Dubai, after PPM generation

revoke execute on function public.plan_dispatch(), public.wo_after_insert_plan(), public.wo_lock_manual_schedule(), public.wo_ppm_earliest() from public, anon, authenticated;
revoke execute on function public.run_auto_dispatch() from public, anon;
grant execute on function public.run_auto_dispatch() to authenticated;
