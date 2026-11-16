-- fx17: service report — report number on every job + letterhead info for the printed report (idempotent)

-- 1) Sequential report number (No. 1001, 1002 …), existing jobs numbered oldest first
create sequence if not exists public.work_orders_report_no_seq start 1001;
alter table public.work_orders add column if not exists report_no bigint;
do $$ begin
  if exists (select 1 from public.work_orders where report_no is null) then
    alter table public.work_orders disable trigger user;   -- no audit/notification noise for the backfill
    with o as (select id, row_number() over (order by created_at, id) rn from public.work_orders where report_no is null)
    update public.work_orders w
       set report_no = coalesce((select max(report_no) from public.work_orders), 1000) + o.rn
      from o where o.id = w.id;
    alter table public.work_orders enable trigger user;
  end if;
  perform setval('public.work_orders_report_no_seq', greatest(1001, coalesce((select max(report_no) from public.work_orders), 1000) + 1), false);
end $$;
alter table public.work_orders alter column report_no set default nextval('public.work_orders_report_no_seq');
create unique index if not exists work_orders_report_no_key on public.work_orders(report_no);
grant usage, select on sequence public.work_orders_report_no_seq to authenticated;

-- report_no is always given by the database and can't be edited by users
create or replace function public.wo_keep_report_no()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.report_no := nextval('public.work_orders_report_no_seq');
  else new.report_no := old.report_no; end if;
  return new;
end $$;
drop trigger if exists trg_wo_keep_report_no on public.work_orders;
create trigger trg_wo_keep_report_no before insert or update of report_no on public.work_orders
  for each row execute function public.wo_keep_report_no();
revoke execute on function public.wo_keep_report_no() from public, anon, authenticated;

-- 2) Letterhead for the report: company name/address/contacts (no bank details) + the store's client name.
--    Only for a store the caller can see.
create or replace function public.report_header(p_store uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.my_role() is null or not public.can_see_store(p_store) then null else
    jsonb_build_object(
      'company_name', s.company_name, 'legal_name', s.legal_name, 'trn', s.trn, 'address', s.address, 'emirate', s.emirate,
      'phone', s.phone, 'email', s.email, 'website', s.website, 'logo_path', s.logo_path,
      'client_name', (select c.name from public.stores st join public.fin_clients c on c.id = st.client_id where st.id = p_store))
  end
  from (select 1) x left join public.fin_settings s on s.id = 1
$$;
revoke execute on function public.report_header(uuid) from public, anon;
grant execute on function public.report_header(uuid) to authenticated;

-- 3) Anyone signed in may read the company logo file (only that one file) so it prints on the report
drop policy if exists fx_att_company_logo_read on storage.objects;
create policy fx_att_company_logo_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and public.my_role() is not null
  and objects.name = (select logo_path from public.fin_settings where id = 1));
