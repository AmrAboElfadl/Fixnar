-- =============================================
-- FIXNAR CMMS — Supabase Database Schema
-- Run this entire file in Supabase SQL Editor
-- =============================================

-- STORES (restaurants/locations)
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude numeric,
  longitude numeric,
  phone text,
  created_at timestamptz default now()
);

-- PROFILES (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text check (role in ('admin','technician','operations')) default 'operations',
  store_id uuid references stores(id),
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ASSETS
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  location text,
  store_id uuid references stores(id),
  serial_number text,
  status text check (status in ('operational','maintenance','inactive','retired')) default 'operational',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- WORK ORDERS
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text check (priority in ('P1','P2','P3','P4')) default 'P3',
  status text check (status in ('open','in_progress','on_hold','closed')) default 'open',
  store_id uuid references stores(id),
  asset_id uuid references assets(id),
  assigned_to uuid references profiles(id),
  created_by uuid references profiles(id),
  closed_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-set closed_at
create or replace function set_closed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status != 'closed' then
    new.closed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_work_order_update on work_orders;
create trigger on_work_order_update
  before update on work_orders
  for each row execute procedure set_closed_at();

-- PPM TASKS
create table if not exists ppm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  asset_id uuid references assets(id),
  store_id uuid references stores(id),
  assigned_to uuid references profiles(id),
  frequency_months integer default 3,
  due_date date not null,
  next_due date,
  status text check (status in ('pending','in_progress','done','overdue')) default 'pending',
  notes text,
  created_at timestamptz default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table stores      enable row level security;
alter table profiles    enable row level security;
alter table assets      enable row level security;
alter table work_orders enable row level security;
alter table ppm_tasks   enable row level security;

-- Helper: get current user role
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- Helper: get current user store_id
create or replace function get_my_store()
returns uuid language sql security definer stable as $$
  select store_id from profiles where id = auth.uid()
$$;

-- STORES policies
create policy "stores_read" on stores for select using (true);
create policy "stores_admin" on stores for all using (get_my_role() = 'admin');

-- PROFILES policies
create policy "profiles_read" on profiles for select using (true);
create policy "profiles_own" on profiles for update using (id = auth.uid());
create policy "profiles_admin" on profiles for all using (get_my_role() = 'admin');

-- ASSETS policies
create policy "assets_read" on assets for select using (true);
create policy "assets_admin" on assets for all using (get_my_role() = 'admin');

-- WORK ORDERS policies
create policy "wo_read_admin_tech" on work_orders for select
  using (get_my_role() in ('admin','technician') or store_id = get_my_store());

create policy "wo_insert" on work_orders for insert
  with check (
    get_my_role() = 'admin' or
    (get_my_role() = 'operations' and store_id = get_my_store())
  );

create policy "wo_update_admin" on work_orders for update
  using (get_my_role() in ('admin','technician'));

-- PPM policies
create policy "ppm_read" on ppm_tasks for select
  using (get_my_role() in ('admin','technician') or store_id = get_my_store());
create policy "ppm_admin" on ppm_tasks for all using (get_my_role() = 'admin');
create policy "ppm_tech_update" on ppm_tasks for update using (get_my_role() = 'technician');

-- =============================================
-- SAMPLE DATA (optional - delete if not needed)
-- =============================================

insert into stores (name, address, latitude, longitude) values
  ('Fixnar - Dubai Mall', 'Dubai Mall, Downtown Dubai', 25.1972, 55.2796),
  ('Fixnar - JBR', 'The Walk, Jumeirah Beach Residence', 25.0762, 55.1329),
  ('Fixnar - Mirdif City Centre', 'Mirdif City Centre, Mirdif', 25.2167, 55.4108)
on conflict do nothing;
