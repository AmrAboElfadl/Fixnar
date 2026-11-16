-- fx14_store_documents.sql — documents & files per store (photos, PDFs, drawings, licences, any file)
-- Files live in the private "attachments" bucket under store/<store_id>/...
-- Read: admin/operations/technician who can see the store. Upload: same. Edit/delete: admin & operations.
-- Vendors and accounts without a profile get nothing. Idempotent.

create table if not exists public.store_documents (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  title        text not null,
  category     text not null default 'Other',
  file_path    text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  expiry_date  date,                      -- licences, certificates, AMC contracts…
  notes        text,
  uploaded_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists store_documents_store_idx on public.store_documents(store_id, created_at desc);
create index if not exists store_documents_expiry_idx on public.store_documents(expiry_date) where expiry_date is not null;

alter table public.store_documents enable row level security;
drop policy if exists fx_sd_read on public.store_documents;
create policy fx_sd_read on public.store_documents for select to authenticated
  using (my_role() in ('admin','operations','technician') and can_see_store(store_id));
drop policy if exists fx_sd_insert on public.store_documents;
create policy fx_sd_insert on public.store_documents for insert to authenticated
  with check (my_role() in ('admin','operations','technician') and can_see_store(store_id));
drop policy if exists fx_sd_update on public.store_documents;
create policy fx_sd_update on public.store_documents for update to authenticated
  using (is_staff()) with check (is_staff());
drop policy if exists fx_sd_delete on public.store_documents;
create policy fx_sd_delete on public.store_documents for delete to authenticated
  using (is_staff());
revoke all on public.store_documents from anon;

-- storage: store/<store_id>/<file>
drop policy if exists fx_att_store_read on storage.objects;
create policy fx_att_store_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'store'
         and public.my_role() in ('admin','operations','technician')
         and exists (select 1 from public.stores st where st.id::text = (storage.foldername(name))[2] and public.can_see_store(st.id)));
drop policy if exists fx_att_store_insert on storage.objects;
create policy fx_att_store_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'store'
              and public.my_role() in ('admin','operations','technician')
              and exists (select 1 from public.stores st where st.id::text = (storage.foldername(name))[2] and public.can_see_store(st.id)));
drop policy if exists fx_att_store_delete on storage.objects;
create policy fx_att_store_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'store' and public.is_staff());
