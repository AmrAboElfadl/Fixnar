-- FIXNAR fx18 — Show the asset photo on the public QR scan page. Idempotent.
-- * public_asset_scan() also returns photo_path.
-- * Signed-out visitors may read ONLY the file that is an asset's current photo (photo_path), nothing
--   else in the private 'attachments' bucket. The app turns it into a 10-minute signed URL.
-- * NOTE: fx16 revokes EXECUTE from anon on every public function. If fx16 is ever re-run,
--   re-run fx17 and this file afterwards.

create or replace function public.is_public_asset_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from assets where photo_path = p_name)
$$;
revoke execute on function public.is_public_asset_photo(text) from public;
grant  execute on function public.is_public_asset_photo(text) to anon;

drop policy if exists fx_att_asset_public_photo on storage.objects;
create policy fx_att_asset_public_photo on storage.objects for select to anon using (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = 'asset' and public.is_public_asset_photo(name)
);

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
    'photo_path',    a.photo_path,
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
