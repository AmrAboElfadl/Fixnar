-- FIXNAR fx05 — Spare parts inventory + monthly budgets. Safe to run more than once.
create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(), name text not null, part_no text, category text,
  unit text not null default 'pcs', unit_cost numeric(12,2) not null default 0, min_qty numeric not null default 0,
  is_active boolean not null default true, notes text, created_at timestamptz not null default now());
create unique index if not exists parts_part_no_key on public.parts(lower(part_no)) where part_no is not null;

create table if not exists public.part_stock (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  qty numeric not null default 0, updated_at timestamptz not null default now(),
  unique nulls not distinct (part_id, store_id));

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  qty_change numeric not null check (qty_change <> 0),
  kind text not null check (kind in ('receive','use','adjust','transfer_in','transfer_out')),
  unit_cost numeric(12,2),
  work_order_id uuid references public.work_orders(id) on delete set null,
  note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now());
create index if not exists stock_mov_part_idx on public.stock_movements(part_id, created_at desc);
create index if not exists stock_mov_wo_idx on public.stock_movements(work_order_id);

alter table public.work_orders add column if not exists parts_cost numeric(12,2) not null default 0;

create or replace function public.stock_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.stock_movements;
  sgn int := case when tg_op = 'DELETE' then -1 else 1 end;
  before_qty numeric; after_qty numeric; p public.parts;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select qty into before_qty from public.part_stock where part_id = r.part_id and store_id is not distinct from r.store_id;
  before_qty := coalesce(before_qty, 0);
  insert into public.part_stock(part_id, store_id, qty, updated_at)
  values (r.part_id, r.store_id, sgn * r.qty_change, now())
  on conflict (part_id, store_id) do update set qty = public.part_stock.qty + sgn * r.qty_change, updated_at = now();
  after_qty := before_qty + sgn * r.qty_change;
  if r.work_order_id is not null then
    update public.work_orders set parts_cost = coalesce((
      select sum(-m.qty_change * coalesce(m.unit_cost, 0)) from public.stock_movements m
      where m.work_order_id = r.work_order_id and m.kind = 'use'), 0)
    where id = r.work_order_id;
  end if;
  select * into p from public.parts where id = r.part_id;
  if p.min_qty > 0 and before_qty > p.min_qty and after_qty <= p.min_qty then
    perform public.notify_users(array(select id from public.profiles where role in ('admin','operations')), 'stock',
      '📦 Low stock — ' || p.name,
      'Only ' || after_qty || ' ' || p.unit || ' left' ||
        coalesce(' at ' || (select name from public.stores where id = r.store_id), ' in central store') ||
        ' (minimum ' || p.min_qty || ')', null);
  end if;
  return null;
end $$;
drop trigger if exists trg_stock_apply on public.stock_movements;
create trigger trg_stock_apply after insert or delete on public.stock_movements
  for each row execute function public.stock_apply();

create or replace function public.stock_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit_cost is null then new.unit_cost := (select unit_cost from public.parts where id = new.part_id); end if;
  if new.kind in ('use','transfer_out') and new.qty_change > 0 then new.qty_change := -new.qty_change; end if;
  return new;
end $$;
drop trigger if exists trg_stock_defaults on public.stock_movements;
create trigger trg_stock_defaults before insert on public.stock_movements
  for each row execute function public.stock_defaults();

alter table public.parts enable row level security;
alter table public.part_stock enable row level security;
alter table public.stock_movements enable row level security;
drop policy if exists fx_parts_read on public.parts;
drop policy if exists fx_parts_write on public.parts;
drop policy if exists fx_ps_read on public.part_stock;
drop policy if exists fx_sm_read on public.stock_movements;
drop policy if exists fx_sm_insert on public.stock_movements;
drop policy if exists fx_sm_delete on public.stock_movements;
create policy fx_parts_read  on public.parts for select to authenticated using (coalesce(public.my_role(),'') <> 'vendor');
create policy fx_parts_write on public.parts for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy fx_ps_read     on public.part_stock for select to authenticated using (coalesce(public.my_role(),'') <> 'vendor');
create policy fx_sm_read     on public.stock_movements for select to authenticated using (coalesce(public.my_role(),'') <> 'vendor');
create policy fx_sm_insert   on public.stock_movements for insert to authenticated with check (
  public.is_staff()
  or (public.my_role() = 'technician' and kind = 'use' and work_order_id is not null
      and exists (select 1 from public.work_orders w where w.id = work_order_id and w.assigned_to = auth.uid())));
create policy fx_sm_delete   on public.stock_movements for delete to authenticated using (public.is_admin());

drop trigger if exists trg_audit on public.parts;
create trigger trg_audit after insert or update or delete on public.parts for each row execute function public.audit_trigger();
drop trigger if exists trg_audit on public.stock_movements;
create trigger trg_audit after insert or update or delete on public.stock_movements for each row execute function public.audit_trigger();

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  alerted_80 boolean not null default false, alerted_100 boolean not null default false,
  created_at timestamptz not null default now(), unique (store_id, month));
alter table public.budgets enable row level security;
drop policy if exists fx_budget_read on public.budgets;
drop policy if exists fx_budget_write on public.budgets;
create policy fx_budget_read  on public.budgets for select to authenticated using (public.is_staff());
create policy fx_budget_write on public.budgets for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists trg_audit on public.budgets;
create trigger trg_audit after insert or update or delete on public.budgets for each row execute function public.audit_trigger();

create or replace function public.store_month_spend(p_store uuid, p_month date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(cost, 0) + coalesce(parts_cost, 0)), 0)
  from public.work_orders
  where store_id = p_store
    and created_at >= (p_month::timestamp at time zone 'Asia/Dubai')
    and created_at <  ((p_month + interval '1 month')::timestamp at time zone 'Asia/Dubai')
$$;

create or replace function public.budget_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare b public.budgets; spend numeric; m date;
begin
  if coalesce(new.migrated, false) then return null; end if;
  m := date_trunc('month', new.created_at at time zone 'Asia/Dubai')::date;
  select * into b from public.budgets where store_id = new.store_id and month = m;
  if not found or b.amount <= 0 then return null; end if;
  spend := public.store_month_spend(new.store_id, m);
  if spend >= b.amount and not b.alerted_100 then
    update public.budgets set alerted_100 = true, alerted_80 = true where id = b.id;
    perform public.notify_users(array(select id from public.profiles where role = 'admin'), 'budget',
      '🚨 Over budget — ' || (select name from public.stores where id = new.store_id),
      to_char(m, 'Mon YYYY') || ': AED ' || to_char(spend, 'FM999,999,990') || ' spent of AED ' || to_char(b.amount, 'FM999,999,990'), new.id);
  elsif spend >= b.amount * 0.8 and not b.alerted_80 then
    update public.budgets set alerted_80 = true where id = b.id;
    perform public.notify_users(array(select id from public.profiles where role = 'admin'), 'budget',
      '⚠️ 80% of budget used — ' || (select name from public.stores where id = new.store_id),
      to_char(m, 'Mon YYYY') || ': AED ' || to_char(spend, 'FM999,999,990') || ' of AED ' || to_char(b.amount, 'FM999,999,990'), new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_budget_check on public.work_orders;
create trigger trg_budget_check after insert or update of cost, parts_cost on public.work_orders
  for each row execute function public.budget_check();

create or replace function public.budget_reset_flags()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.amount is distinct from old.amount then new.alerted_80 := false; new.alerted_100 := false; end if;
  return new;
end $$;
drop trigger if exists trg_budget_reset on public.budgets;
create trigger trg_budget_reset before update on public.budgets for each row execute function public.budget_reset_flags();

revoke execute on function public.stock_apply(), public.stock_defaults(), public.budget_check(), public.budget_reset_flags() from public, anon, authenticated;
revoke execute on function public.store_month_spend(uuid, date) from public, anon;
grant execute on function public.store_month_spend(uuid, date) to authenticated;
