-- fx15: fix store document uploads + tighten security (idempotent)
-- Bug: inside the EXISTS on stores, "name" resolved to stores.name instead of the file's path,
-- so every upload to store/<store_id>/… was refused. Use objects.name explicitly.

-- Helper: store id from a storage path "store/<uuid>/file" (null if not that shape)
create or replace function public.store_id_from_path(p text)
returns uuid language sql immutable as $$
  select case when split_part(p, '/', 1) = 'store'
               and split_part(p, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p, '/', 2)::uuid end
$$;

drop policy if exists fx_att_store_read   on storage.objects;
drop policy if exists fx_att_store_insert on storage.objects;
drop policy if exists fx_att_store_delete on storage.objects;

create policy fx_att_store_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and (storage.foldername(objects.name))[1] = 'store'
  and public.my_role() in ('admin','operations','technician')
  and public.can_see_store(public.store_id_from_path(objects.name)));

create policy fx_att_store_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and (storage.foldername(objects.name))[1] = 'store'
  and public.my_role() in ('admin','operations','technician')
  and exists (select 1 from public.stores st where st.id = public.store_id_from_path(objects.name))
  and public.can_see_store(public.store_id_from_path(objects.name)));

-- delete: staff only, and only for stores they can see
create policy fx_att_store_delete on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and (storage.foldername(objects.name))[1] = 'store'
  and public.is_staff() and public.can_see_store(public.store_id_from_path(objects.name)));

-- A document row may only point at a file inside its own store's folder
alter table public.store_documents drop constraint if exists store_documents_path_matches_store;
alter table public.store_documents add constraint store_documents_path_matches_store
  check (public.store_id_from_path(file_path) = store_id);

-- update/delete rows: staff, limited to stores they can see; store_id can't be moved to another store
drop policy if exists fx_sd_update on public.store_documents;
drop policy if exists fx_sd_delete on public.store_documents;
create policy fx_sd_update on public.store_documents for update to authenticated
  using (public.is_staff() and public.can_see_store(store_id))
  with check (public.is_staff() and public.can_see_store(store_id));
create policy fx_sd_delete on public.store_documents for delete to authenticated
  using (public.is_staff() and public.can_see_store(store_id));

-- uploaded_by is always the real uploader
create or replace function public.store_documents_set_uploader()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.uploaded_by := auth.uid(); new.created_at := now();
  else new.uploaded_by := old.uploaded_by; new.created_at := old.created_at; new.file_path := old.file_path; new.store_id := old.store_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_store_documents_uploader on public.store_documents;
create trigger trg_store_documents_uploader before insert or update on public.store_documents
  for each row execute function public.store_documents_set_uploader();

-- Bucket: private, 50 MB per file
update storage.buckets set public = false, file_size_limit = 52428800 where id = 'attachments';
