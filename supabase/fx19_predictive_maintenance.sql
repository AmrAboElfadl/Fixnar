-- FIXNAR fx19 — AI predictive maintenance (owner approved 2026-11-22). Idempotent, additive only.
--
--   asset_readings  — one row per measurement: technician on a job, a sensor, or the test simulator.
--   asset_alerts    — one open alert per machine + kind, raised by predictive_scan(), worked from /predictive.
--   predictive_scan() (hourly, pg_cron; also "Run scan now") raises / updates / clears alerts from:
--     limit         latest reading outside the safe range for that kind of machine
--     drift         temperatures trending towards the limit (linear trend, projected 3 days ahead),
--                   or amps / vibration ≥ 20 % above the machine's own baseline
--     repeat_faults ≥ 2 breakdown jobs on the machine in 90 days
--     keyword       technician notes mention noise, ice, leak, tripping, burning smell, overheating, vibration
--     ppm_overdue   an active PPM plan on the machine is > 7 days overdue
--   Critical alerts open a "⚠ Predicted" work order (P2, wo_type 'predictive') when the machine has no open job.
--   Watchers of the store (admin / operations) get an in-app notification when an alert is new or gets worse.
--
-- Ships OFF: nothing is scanned, raised or notified until an admin switches it on (predictive_settings.enabled).
-- Rollback: select cron.unschedule('fixnar_predictive_scan'); drop the functions below; drop table asset_alerts, asset_readings, predictive_settings.

-- ── on/off switch (OFF until an admin turns it on in /predictive) ──────────────
create table if not exists public.predictive_settings (
  id               int primary key default 1 check (id = 1),
  enabled          boolean not null default false,
  auto_work_orders boolean not null default true,
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
insert into public.predictive_settings(id) values (1) on conflict do nothing;
alter table public.predictive_settings enable row level security;
drop policy if exists fx_ps_read  on public.predictive_settings;
drop policy if exists fx_ps_write on public.predictive_settings;
create policy fx_ps_read  on public.predictive_settings for select to authenticated using (true);
create policy fx_ps_write on public.predictive_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.asset_readings (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references public.assets(id) on delete cascade,
  store_id      uuid references public.stores(id),
  metric        text not null check (metric in ('temp_c','amps','oil_temp_c','supply_air_c','vibration','humidity')),
  value         numeric not null,
  source        text not null default 'manual' check (source in ('manual','sensor','simulator')),
  work_order_id uuid references public.work_orders(id) on delete set null,
  note          text,
  recorded_by   uuid references public.profiles(id),
  recorded_at   timestamptz not null default now()
);
create index if not exists asset_readings_asset_metric_time on public.asset_readings (asset_id, metric, recorded_at desc);

create table if not exists public.asset_alerts (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references public.assets(id) on delete cascade,
  store_id      uuid references public.stores(id),
  kind          text not null check (kind in ('limit','drift','repeat_faults','keyword','ppm_overdue')),
  severity      text not null check (severity in ('watch','warn','critical')),
  score         int  not null default 0,
  title         text not null,
  details       jsonb not null default '{}'::jsonb,
  status        text not null default 'open' check (status in ('open','acknowledged','resolved','false_alarm')),
  work_order_id uuid references public.work_orders(id) on delete set null,
  snoozed_until timestamptz,
  resolved_note text,
  handled_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists asset_alerts_one_active on public.asset_alerts (asset_id, kind) where status in ('open','acknowledged');
create index if not exists asset_alerts_status on public.asset_alerts (status, severity);

-- store_id always comes from the machine (never trusted from the client)
create or replace function public.pm_set_store() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.store_id := (select store_id from public.assets where id = new.asset_id);
  if tg_table_name = 'asset_readings' and new.source <> 'sensor' then new.recorded_by := coalesce(auth.uid(), new.recorded_by); end if;
  return new;
end $$;
drop trigger if exists trg_pm_readings_store on public.asset_readings;
create trigger trg_pm_readings_store before insert on public.asset_readings for each row execute function public.pm_set_store();

-- ── access (RLS) ────────────────────────────────────────────────────────────
alter table public.asset_readings enable row level security;
alter table public.asset_alerts   enable row level security;
drop policy if exists fx_ar_read   on public.asset_readings;
drop policy if exists fx_ar_insert on public.asset_readings;
drop policy if exists fx_ar_admin  on public.asset_readings;
create policy fx_ar_read   on public.asset_readings for select to authenticated
  using (public.my_role() in ('admin','operations','technician') and public.can_see_store(store_id));
create policy fx_ar_insert on public.asset_readings for insert to authenticated
  with check (public.my_role() in ('admin','operations','technician') and source <> 'sensor'
              and public.can_see_store((select a.store_id from public.assets a where a.id = asset_id)));
create policy fx_ar_admin  on public.asset_readings for delete to authenticated using (public.is_admin());
drop policy if exists fx_aa_read   on public.asset_alerts;
drop policy if exists fx_aa_update on public.asset_alerts;
create policy fx_aa_read   on public.asset_alerts for select to authenticated
  using (public.my_role() in ('admin','operations','technician') and public.can_see_store(store_id));
create policy fx_aa_update on public.asset_alerts for update to authenticated
  using (public.is_staff() and public.can_see_store(store_id)) with check (public.is_staff() and public.can_see_store(store_id));

-- ── safe ranges by kind of machine (name / subcategory / category keywords) ──
create or replace function public.pm_limits(p_asset uuid, p_metric text, out lo numeric, out hi numeric, out crit_lo numeric, out crit_hi numeric)
language plpgsql stable set search_path = public as $$
declare t text;
begin
  select lower(coalesce(name,'')||' '||coalesce(subcategory,'')||' '||coalesce(category,'')) into t from public.assets where id = p_asset;
  if p_metric = 'temp_c' then
    if t ~ 'freez|blast' then lo := -30; hi := -15; crit_hi := -12;
    elsif t ~ 'chill|fridge|refrig|cold|walk.?in|undercounter|display|salad|bain' then lo := 0; hi := 5; crit_lo := -2; crit_hi := 8;
    end if;
  elsif p_metric = 'oil_temp_c' then lo := 150; hi := 185; crit_hi := 195;
  elsif p_metric = 'supply_air_c' then hi := 16; crit_hi := 20;
  end if;
end $$;

-- ── raise / update one alert; notify when new or worse ──────────────────────
create or replace function public.pm_raise(p_asset uuid, p_kind text, p_sev text, p_score int, p_title text, p_details jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record; old_sev text; aid uuid; rank_new int; rank_old int; wo uuid; open_wo uuid;
begin
  select id, name, store_id, category into a from public.assets where id = p_asset;
  select id, severity into aid, old_sev from public.asset_alerts where asset_id = p_asset and kind = p_kind and status in ('open','acknowledged');
  rank_new := case p_sev when 'critical' then 3 when 'warn' then 2 else 1 end;
  rank_old := case old_sev when 'critical' then 3 when 'warn' then 2 when 'watch' then 1 else 0 end;
  if aid is null then
    insert into public.asset_alerts(asset_id, store_id, kind, severity, score, title, details)
    values (p_asset, a.store_id, p_kind, p_sev, p_score, p_title, p_details) returning id into aid;
  else
    update public.asset_alerts set severity = p_sev, score = p_score, title = p_title, details = p_details, updated_at = now() where id = aid;
  end if;
  -- notify (not while snoozed) when the alert is new or got worse
  if rank_new > rank_old and not exists (select 1 from public.asset_alerts where id = aid and snoozed_until > now()) then
    perform public.notify_users(array(select public.wo_watchers(a.store_id)), 'predictive',
      case p_sev when 'critical' then '🔴 ' when 'warn' then '🟠 ' else '🟡 ' end || 'Predicted: ' || coalesce(a.name,'machine'), p_title, null);
  end if;
  -- critical: open a predicted work order if the machine has no open job (unless switched off in settings)
  if p_sev = 'critical' and coalesce((select auto_work_orders from public.predictive_settings where id = 1), false) and (select work_order_id from public.asset_alerts where id = aid) is null then
    select id into open_wo from public.work_orders where asset_id = p_asset and status not in ('completed','closed') limit 1;
    if open_wo is null then
      insert into public.work_orders(title, description, priority, status, store_id, asset_id, category, wo_type)
      values ('⚠ Predicted: ' || coalesce(a.name,'machine') || ' — ' || p_title,
              'Raised automatically by predictive maintenance before a breakdown. ' || coalesce(p_details->>'explain',''),
              'P2', 'open', a.store_id, p_asset, coalesce(a.category, 'Predictive'), 'predictive')
      returning id into wo;
      update public.asset_alerts set work_order_id = wo where id = aid;
    else
      update public.asset_alerts set work_order_id = open_wo where id = aid;
    end if;
  end if;
  return aid;
end $$;

-- ── the scan ────────────────────────────────────────────────────────────────
create or replace function public.predictive_scan() returns int language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz := now();   -- transaction time: rows touched in this run carry exactly this time
  n int := 0; r record; lim record;
  slope numeric; proj numeric; days_to numeric; base numeric; recent numeric; pct numeric;
begin
  if not coalesce((select enabled from public.predictive_settings where id = 1), false) then return 0; end if;   -- switched off
  -- 1+2. readings: limits, temperature trend, amps / vibration baseline
  for r in
    select distinct on (asset_id, metric) asset_id, metric, value, recorded_at
    from public.asset_readings where recorded_at > now() - interval '30 days'
    order by asset_id, metric, recorded_at desc
  loop
    slope := null; proj := null; days_to := null; base := null; recent := null; pct := null;   -- nothing carries over between machines
    select * into lim from public.pm_limits(r.asset_id, r.metric);
    if lim.hi is not null or lim.lo is not null then
      if (lim.crit_hi is not null and r.value > lim.crit_hi) or (lim.crit_lo is not null and r.value < lim.crit_lo) then
        perform public.pm_raise(r.asset_id, 'limit', 'critical', 90, r.metric || ' ' || r.value || ' — outside the safe range',
          jsonb_build_object('metric', r.metric, 'value', r.value, 'lo', lim.lo, 'hi', lim.hi, 'at', r.recorded_at,
                             'explain', 'Latest reading ' || r.value || ' is beyond the critical limit.')); n := n + 1;
      elsif (lim.hi is not null and r.value > lim.hi) or (lim.lo is not null and r.value < lim.lo) then
        perform public.pm_raise(r.asset_id, 'limit', 'warn', 65, r.metric || ' ' || r.value || ' — above normal',
          jsonb_build_object('metric', r.metric, 'value', r.value, 'lo', lim.lo, 'hi', lim.hi, 'at', r.recorded_at)); n := n + 1;
      elsif lim.hi is not null then
        -- trend over the last 14 days (needs ≥ 3 readings), projected 3 days ahead
        select regr_slope(value, extract(epoch from recorded_at) / 86400.0), count(*) into slope, base
        from public.asset_readings where asset_id = r.asset_id and metric = r.metric and recorded_at > now() - interval '14 days';
        if base >= 3 and slope > 0 then
          proj := r.value + slope * 3;
          if proj > lim.hi then
            days_to := round((lim.hi - r.value) / slope, 1);
            perform public.pm_raise(r.asset_id, 'drift', 'warn', 70,
              'Rising ' || r.metric || ': expected to pass ' || lim.hi || ' in about ' || greatest(days_to, 0) || ' days',
              jsonb_build_object('metric', r.metric, 'value', r.value, 'hi', lim.hi, 'slope_per_day', round(slope, 3), 'days_to_limit', days_to,
                                 'explain', 'Readings are climbing about ' || round(slope, 2) || ' per day.')); n := n + 1;
          end if;
        end if;
      end if;
    elsif r.metric in ('amps','vibration') then
      select percentile_cont(0.5) within group (order by value) into base from (
        select value from public.asset_readings where asset_id = r.asset_id and metric = r.metric and recorded_at < now() - interval '7 days'
        order by recorded_at desc limit 20) b
      having count(*) >= 3;
      select avg(value) into recent from (select value from public.asset_readings where asset_id = r.asset_id and metric = r.metric order by recorded_at desc limit 3) x;
      if base > 0 and recent is not null then
        pct := round((recent - base) / base * 100, 0);
        if pct >= 35 then
          perform public.pm_raise(r.asset_id, 'drift', 'critical', 85, r.metric || ' ' || pct || '% above this machine''s normal',
            jsonb_build_object('metric', r.metric, 'baseline', base, 'recent', round(recent, 2), 'pct', pct,
                               'explain', 'The motor is drawing ' || pct || '% more than usual — a typical sign of a failing compressor, fan or bearing.')); n := n + 1;
        elsif pct >= 20 then
          perform public.pm_raise(r.asset_id, 'drift', 'warn', 60, r.metric || ' ' || pct || '% above this machine''s normal',
            jsonb_build_object('metric', r.metric, 'baseline', base, 'recent', round(recent, 2), 'pct', pct)); n := n + 1;
        end if;
      end if;
    end if;
  end loop;

  -- 3. repeat faults (breakdowns only, last 90 days)
  for r in
    select asset_id, count(*) c from public.work_orders
    where asset_id is not null and created_at > now() - interval '90 days' and coalesce(wo_type, 'reactive') not in ('ppm','predictive')
    group by asset_id having count(*) >= 2
  loop
    perform public.pm_raise(r.asset_id, 'repeat_faults', case when r.c >= 3 then 'critical' else 'warn' end, least(95, 40 + r.c * 15),
      r.c || ' breakdowns in 90 days', jsonb_build_object('count', r.c, 'explain', 'Repeated breakdowns usually mean the root cause was not fixed.')); n := n + 1;
  end loop;

  -- 4. warning words in technician notes (last 60 days)
  for r in
    select w.asset_id, string_agg(distinct m[1], ', ') words from public.work_orders w
    left join public.wo_updates u on u.work_order_id = w.id and u.created_at > now() - interval '60 days'
    cross join lateral regexp_matches(lower(coalesce(w.work_update,'') || ' ' || coalesce(w.description,'') || ' ' || coalesce(u.content,'')),
      '(noise|noisy|ice build|icing|leak|tripp|burning smell|smell of burning|overheat|vibrat|sparks?)', 'g') m
    where w.asset_id is not null and w.created_at > now() - interval '60 days'
    group by w.asset_id
  loop
    perform public.pm_raise(r.asset_id, 'keyword', 'watch', 35, 'Technician notes mention: ' || r.words,
      jsonb_build_object('words', r.words)); n := n + 1;
  end loop;

  -- 5. PPM overdue
  for r in
    select asset_id, max(current_date - next_due) days from public.ppm_tasks
    where is_active and asset_id is not null and next_due < current_date - 7 group by asset_id
  loop
    perform public.pm_raise(r.asset_id, 'ppm_overdue', 'warn', 50, 'PPM overdue by ' || r.days || ' days',
      jsonb_build_object('days', r.days)); n := n + 1;
  end loop;

  -- conditions that no longer hold: clear open alerts this run did not touch
  update public.asset_alerts set status = 'resolved', resolved_note = 'Cleared automatically — the condition is gone', updated_at = now()
  where status = 'open' and updated_at < t0;
  return n;
end $$;

-- ── what the app may call ───────────────────────────────────────────────────
create or replace function public.run_predictive_scan() returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only admin or operations can run the predictive scan'; end if;
  return public.predictive_scan();
end $$;

-- Test data for one machine (admin only): 'normal', 'drift' (rising towards the limit) or 'breach'. Marked source = 'simulator'.
create or replace function public.simulate_readings(p_asset uuid, p_metric text, p_pattern text) returns int
language plpgsql security definer set search_path = public as $$
declare lim record; i int; v numeric; base numeric; step numeric; k int := 0;
begin
  if not public.is_admin() then raise exception 'Only an admin can create test readings'; end if;
  if p_pattern not in ('normal','drift','breach') then raise exception 'Pattern must be normal, drift or breach'; end if;
  select * into lim from public.pm_limits(p_asset, p_metric);
  base := case when p_metric in ('amps') then 6 when p_metric = 'vibration' then 2 when lim.hi is not null then lim.hi - 2.5 else 10 end;
  for i in reverse 9..0 loop
    if p_metric in ('amps','vibration') then
      v := base * case when p_pattern = 'normal' then 1 when i <= 2 then (case when p_pattern = 'drift' then 1.25 else 1.5 end) else 1 end;
    else
      step := case p_pattern when 'normal' then 0 when 'drift' then 0.25 else 0.7 end;   -- drift ends just inside the limit, trend crosses it within 3 days
      v := base + step * (9 - i);
    end if;
    insert into public.asset_readings(asset_id, metric, value, source, note, recorded_at)
    values (p_asset, p_metric, round((v + (random() - 0.5) * 0.2)::numeric, 2), 'simulator', 'test data (' || p_pattern || ')', now() - make_interval(days => i * 2));   -- one reading every 2 days over 18 days
    k := k + 1;
  end loop;
  return k;
end $$;

create or replace function public.clear_simulated_readings(p_asset uuid) returns int
language plpgsql security definer set search_path = public as $$
declare k int;
begin
  if not public.is_admin() then raise exception 'Only an admin can clear test readings'; end if;
  delete from public.asset_readings where asset_id = p_asset and source = 'simulator';
  get diagnostics k = row_count;
  return k;
end $$;

-- internal helpers: scheduler / wrappers only (same rule as fx16)
revoke execute on function public.predictive_scan() from public, anon, authenticated;
revoke execute on function public.pm_raise(uuid, text, text, int, text, jsonb) from public, anon, authenticated;
revoke execute on function public.pm_set_store() from public, anon, authenticated;
revoke execute on function public.pm_limits(uuid, text) from public, anon;
revoke execute on function public.run_predictive_scan() from public, anon;
revoke execute on function public.simulate_readings(uuid, text, text) from public, anon;
revoke execute on function public.clear_simulated_readings(uuid) from public, anon;
grant execute on function public.run_predictive_scan(), public.simulate_readings(uuid, text, text),
  public.clear_simulated_readings(uuid), public.pm_limits(uuid, text) to authenticated;

-- live updates on the /predictive screen
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'asset_alerts') then
    execute 'alter publication supabase_realtime add table public.asset_alerts'; end if;
end $$;

-- hourly scan (Dubai :20 past every hour)
do $$ begin
  if exists (select 1 from cron.job where jobname = 'fixnar_predictive_scan') then perform cron.unschedule('fixnar_predictive_scan'); end if;
  perform cron.schedule('fixnar_predictive_scan', '20 * * * *', 'select public.predictive_scan()');
end $$;
