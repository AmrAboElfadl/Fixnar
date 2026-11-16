-- fx12_signup_lock_numbering.sql
-- 1) Self sign-up can no longer get access. A profile (and so any access) is only created for users made by
--    an admin (create_user_with_role) or by SQL run as the database owner (Developer panel / SQL editor).
--    Anyone who signs up through the public auth API gets no profile, so every RLS rule denies them.
-- 2) Document numbering style per company: 'year' = QT-2026-0001 (default), 'plain' = WHT251 / 5510,
--    continuing from a starting number (for companies moving from another system).
-- Idempotent.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('fixnar.creating_user', true), '') <> 'on'
     and session_user not in ('postgres', 'supabase_admin') then   -- session_user: the real caller (current_user is the function owner here)
    return new;                          -- public sign-up: no profile, no access
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'operations')
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.create_user_with_role(p_email text, p_password text, p_name text, p_role text, p_store_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Only an admin can create users'; end if;
  if p_role not in ('admin','operations','technician','vendor') then raise exception 'Invalid role %', p_role; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    raise exception 'A user with email % already exists', p_email;
  end if;
  perform set_config('fixnar.creating_user', 'on', true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true),
    'email', now(), now(), now());
  perform set_config('fixnar.creating_user', 'off', true);
  update public.profiles set role = p_role, full_name = p_name, store_id = p_store_id where id = uid;
  return uid;
end $$;

alter table public.fin_settings add column if not exists number_style text not null default 'year';
alter table public.fin_settings drop constraint if exists fin_settings_number_style_check;
alter table public.fin_settings add constraint fin_settings_number_style_check check (number_style in ('year','plain'));

create or replace function public.fin_next_number(p_kind text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare v_style text; v_yr int; v_n int; v_prefix text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select number_style,
         case p_kind when 'quote' then quote_prefix when 'invoice' then invoice_prefix
                     when 'credit_note' then credit_prefix when 'bill' then bill_prefix else upper(p_kind) end
    into v_style, v_prefix from fin_settings where id = 1;
  v_yr := case when v_style = 'plain' then 0 else extract(year from coalesce(p_date, current_date))::int end;
  insert into fin_counters(kind, yr, last) values (p_kind, v_yr, 1)
  on conflict (kind, yr) do update set last = fin_counters.last + 1
  returning last into v_n;
  if v_style = 'plain' then return coalesce(v_prefix, '') || v_n; end if;
  return v_prefix || '-' || v_yr || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke all on function public.fin_next_number(text, date) from anon, public;
grant execute on function public.fin_next_number(text, date) to authenticated;
revoke all on function public.create_user_with_role(text, text, text, text, uuid) from anon, public;
grant execute on function public.create_user_with_role(text, text, text, text, uuid) to authenticated;
