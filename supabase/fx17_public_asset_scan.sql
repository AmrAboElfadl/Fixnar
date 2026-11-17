-- FIXNAR fx17 — Public asset scan: anyone who scans the QR on an asset label sees the asset's
-- live details without signing in. Idempotent.
--
-- * Looks up by asset UUID only (the value in the QR). UUIDs can't be guessed, so nobody can walk
--   through the register by trying FX-00001, FX-00002… The short FX code still needs sign-in.
-- * Returns a safe subset only: no costs, market prices, notes, vendor names, phone numbers or people.
-- * Reads live tables on every scan, so printed labels never need reprinting when data changes.
-- * NOTE: fx16 revokes EXECUTE from anon on every public function. If fx16 is ever re-run,
--   re-run this file afterwards.

create or replace function public.public_asset_scan(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',            a.id,
    'asset_code',    a.asset_code,
    'name',          a.name,
    'category',      a.category,
    'subcategory',   a.subcategory,
    'brand',         a.brand,
    'model',         a.model,
    'serial_number', a.serial_number,
    'status',        coalesce(a.status, 'operational'),
    'location',      a.location,
    'purchase_date', a.purchase_date,
    'specs',         coalesce(a.specs, '{}'::jsonb),
    'store_name',    s.name,
    'updated_at',    a.updated_at,
    'open_jobs',     (select count(*) from work_orders w
                       where w.asset_id = a.id and w.status not in ('completed','closed')),
    'breakdowns',    (select count(*) from work_orders w
                       where w.asset_id = a.id and coalesce(w.wo_type, 'reactive') <> 'ppm'),
    'last_service',  (select max(coalesce(w.completed_at, w.closed_at)) from work_orders w
                       where w.asset_id = a.id and w.status in ('completed','closed')),
    'next_ppm',      (select min(p.next_due) from ppm_tasks p
                       where p.asset_id = a.id and coalesce(p.is_active, true)),
    'history',       coalesce((
                       select jsonb_agg(h order by h.created_at desc) from (
                         select w.title, w.priority, w.status, coalesce(w.wo_type, 'reactive') as wo_type,
                                w.created_at, coalesce(w.completed_at, w.closed_at) as done_at
                         from work_orders w where w.asset_id = a.id
                         order by w.created_at desc limit 10) h), '[]'::jsonb)
  )
  from assets a
  left join stores s on s.id = a.store_id
  where a.id = p_id
$$;

revoke execute on function public.public_asset_scan(uuid) from public;
grant  execute on function public.public_asset_scan(uuid) to anon, authenticated;
