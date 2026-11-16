-- FIXNAR fx09 — Asset register: barcode codes, photos, technical specs, market value, repair stats
-- Idempotent. Applied in Supabase.

-- ── New asset fields ──
create sequence if not exists public.asset_code_seq start 1;
alter table public.assets add column if not exists asset_code      text;
alter table public.assets add column if not exists photo_path      text;      -- storage: attachments/asset/<id>/...
alter table public.assets add column if not exists specs           jsonb not null default '{}'::jsonb;
alter table public.assets add column if not exists specs_source    text;      -- 'ai' | 'manual'
alter table public.assets add column if not exists ai_identified   jsonb;     -- what the photo recognition returned
alter table public.assets add column if not exists market_price_low  numeric(12,2);
alter table public.assets add column if not exists market_price_mid  numeric(12,2);
alter table public.assets add column if not exists market_price_high numeric(12,2);
alter table public.assets add column if not exists market_value      numeric(12,2);  -- average of low and mid
alter table public.assets add column if not exists market_currency   text default 'AED';
alter table public.assets add column if not exists market_sources    jsonb;
alter table public.assets add column if not exists market_checked_at timestamptz;
alter table public.assets add column if not exists created_by       uuid references public.profiles(id) on delete set null default auth.uid();

-- Barcode value: FX-00001 … (Code 128 friendly, unique, never reused)
select set_config('fixnar.auto_plan', 'on', true);   -- bulk backfill: keep it out of the audit trail
update public.assets a set asset_code = 'FX-' || lpad(nextval('public.asset_code_seq')::text, 5, '0')
from (select id from public.assets where asset_code is null order by store_id, category, name) x
where a.id = x.id;
alter table public.assets alter column asset_code set default ('FX-' || lpad(nextval('public.asset_code_seq')::text, 5, '0'));
create unique index if not exists assets_asset_code_key on public.assets(asset_code);
alter table public.assets alter column asset_code set not null;
select set_config('fixnar.auto_plan', 'off', true);

-- Keep market_value = average(low, mid) whenever prices change
create or replace function public.asset_market_value()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.market_price_low is not null and new.market_price_mid is not null then
    new.market_value := round((new.market_price_low + new.market_price_mid) / 2, 2);
  elsif coalesce(new.market_price_low, new.market_price_mid) is not null then
    new.market_value := coalesce(new.market_price_mid, new.market_price_low);
  else
    new.market_value := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_asset_market_value on public.assets;
create trigger trg_asset_market_value before insert or update of market_price_low, market_price_mid on public.assets
  for each row execute function public.asset_market_value();
revoke execute on function public.asset_market_value() from public, anon, authenticated;

-- ── Repair history per asset (breakdowns = reactive jobs, not PPM) ──
create or replace view public.asset_stats with (security_invoker = true) as
select a.id as asset_id,
       count(w.id) filter (where coalesce(w.wo_type, 'reactive') <> 'ppm')                         as breakdowns,
       count(w.id) filter (where w.wo_type = 'ppm')                                                 as ppm_jobs,
       count(w.id) filter (where w.status not in ('completed','closed'))                            as open_jobs,
       coalesce(sum(coalesce(w.cost, 0) + coalesce(w.parts_cost, 0)), 0)                            as repair_cost,
       max(w.created_at) filter (where coalesce(w.wo_type, 'reactive') <> 'ppm')                    as last_breakdown_at
from public.assets a
left join public.work_orders w on w.asset_id = a.id
group by a.id;
grant select on public.asset_stats to authenticated;

-- ── Asset photos in the private 'attachments' bucket: asset/<asset_id>/<file> ──
drop policy if exists fx_att_asset_read on storage.objects;
drop policy if exists fx_att_asset_insert on storage.objects;
create policy fx_att_asset_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = 'asset'
  and coalesce(public.my_role(), '') <> 'vendor'
);
create policy fx_att_asset_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = 'asset'
  and public.my_role() in ('admin','operations','technician')
);

-- Technicians may add a photo / fill details of an asset they are working on (not delete or re-price)
drop policy if exists fx_assets_update on public.assets;
create policy fx_assets_update on public.assets for update to authenticated
  using (public.is_staff() or public.my_role() = 'technician')
  with check (public.is_staff() or public.my_role() = 'technician');

create or replace function public.asset_tech_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'technician' then
    if new.store_id is distinct from old.store_id or new.asset_code is distinct from old.asset_code
       or new.market_price_low is distinct from old.market_price_low or new.market_price_mid is distinct from old.market_price_mid
       or new.market_price_high is distinct from old.market_price_high or new.status is distinct from old.status then
      raise exception 'Technicians can update photo and technical details only';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_asset_tech_guard on public.assets;
create trigger trg_asset_tech_guard before update on public.assets for each row execute function public.asset_tech_guard();
revoke execute on function public.asset_tech_guard() from public, anon, authenticated;
