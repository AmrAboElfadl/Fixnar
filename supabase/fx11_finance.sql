-- fx11_finance.sql — Fixnar Finance: clients, quotations, UAE tax invoices & credit notes,
-- payments, vendor bills, double-entry ledger, period lock, bank reconciliation.
-- ADMIN ONLY: every fin_* table is readable/writable only by role = admin.
-- Idempotent: safe to run more than once.

-- ── Settings (single row) ───────────────────────────────────────────────────
create table if not exists public.fin_settings (
  id              int primary key default 1 check (id = 1),
  company_name    text not null default 'My Facility Company',
  legal_name      text,
  trn             text,
  address         text,
  emirate         text default 'Dubai',
  phone           text,
  email           text,
  website         text,
  logo_path       text,
  bank_name       text,
  account_name    text,
  iban            text,
  swift           text,
  vat_rate        numeric(5,2) not null default 5,
  quote_prefix    text not null default 'QT',
  invoice_prefix  text not null default 'INV',
  credit_prefix   text not null default 'CN',
  bill_prefix     text not null default 'BILL',
  payment_terms_days int not null default 30,
  quote_valid_days   int not null default 30,
  quote_terms     text default 'Prices in AED excluding VAT unless stated. Valid for 30 days. 50% advance on approval, balance on completion.',
  invoice_terms   text default 'Payment due within 30 days by bank transfer. Please quote the invoice number.',
  lock_date       date,                      -- nothing can be posted on/before this date
  fy_start_month  int not null default 1,
  updated_at      timestamptz default now()
);
insert into public.fin_settings (id) values (1) on conflict (id) do nothing;

-- ── Chart of accounts ───────────────────────────────────────────────────────
create table if not exists public.fin_accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  type        text not null check (type in ('asset','liability','equity','income','expense')),
  subtype     text,                -- bank, cash, receivable, payable, tax, current, fixed, cogs, ...
  system_key  text unique,         -- used by automatic posting
  is_active   boolean not null default true,
  description text,
  created_at  timestamptz default now()
);
insert into public.fin_accounts (code, name, type, subtype, system_key) values
  ('1000','Cash on hand','asset','cash','cash'),
  ('1010','Bank account','asset','bank','bank'),
  ('1100','Accounts receivable (clients)','asset','receivable','ar'),
  ('1200','Materials & spare parts stock','asset','current',null),
  ('1300','VAT recoverable (input VAT)','asset','tax','vat_in'),
  ('1400','Prepaid expenses & deposits','asset','current',null),
  ('1500','Tools & equipment','asset','fixed',null),
  ('1510','Vehicles','asset','fixed',null),
  ('1590','Accumulated depreciation','asset','fixed',null),
  ('2000','Accounts payable (vendors)','liability','payable','ap'),
  ('2100','VAT payable (output VAT)','liability','tax','vat_out'),
  ('2200','Accrued salaries & end of service','liability','current',null),
  ('2300','Client advances received','liability','current',null),
  ('3000','Owner capital','equity',null,'capital'),
  ('3100','Retained earnings','equity',null,'retained'),
  ('3200','Owner drawings','equity',null,'drawings'),
  ('4000','Maintenance service revenue','income',null,'revenue'),
  ('4100','AMC / contract revenue','income',null,null),
  ('4200','Materials & parts revenue','income',null,null),
  ('4300','Fit-out & project revenue','income',null,null),
  ('4900','Other income','income',null,null),
  ('5000','Subcontractor costs','expense','cogs','cogs'),
  ('5100','Materials & parts cost','expense','cogs',null),
  ('5200','Direct labour','expense','cogs',null),
  ('6000','Salaries & wages','expense',null,null),
  ('6100','Office & warehouse rent','expense',null,null),
  ('6200','Vehicle, fuel & Salik','expense',null,null),
  ('6300','Tools & consumables','expense',null,null),
  ('6400','Visas, licences & government fees','expense',null,null),
  ('6500','Telephone & internet','expense',null,null),
  ('6600','Bank charges','expense',null,'bank_fees'),
  ('6700','Insurance','expense',null,null),
  ('6800','Depreciation','expense',null,null),
  ('6900','Other expenses','expense',null,'other_exp')
on conflict (code) do nothing;

-- ── Clients (outside companies + the brands already in Fixnar) ─────────────
create table if not exists public.fin_clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  trn           text,
  address       text,
  emirate       text default 'Dubai',
  contact_name  text,
  phone         text,
  email         text,
  payment_terms_days int,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz default now()
);
alter table public.stores add column if not exists client_id uuid references public.fin_clients(id) on delete set null;

-- ── Document numbering (sequential per type per year, no gaps) ─────────────
create table if not exists public.fin_counters (
  kind text not null, yr int not null, last int not null default 0,
  primary key (kind, yr)
);
create or replace function public.fin_next_number(p_kind text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare v_yr int := extract(year from coalesce(p_date, current_date)); v_n int; v_prefix text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  insert into fin_counters(kind, yr, last) values (p_kind, v_yr, 1)
  on conflict (kind, yr) do update set last = fin_counters.last + 1
  returning last into v_n;
  select case p_kind when 'quote' then quote_prefix when 'invoice' then invoice_prefix
                     when 'credit_note' then credit_prefix when 'bill' then bill_prefix else upper(p_kind) end
    into v_prefix from fin_settings where id = 1;
  return v_prefix || '-' || v_yr || '-' || lpad(v_n::text, 4, '0');
end $$;

-- ── Quotations ──────────────────────────────────────────────────────────────
create table if not exists public.fin_quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  client_id     uuid not null references public.fin_clients(id),
  store_id      uuid references public.stores(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  subject       text,
  issue_date    date not null default current_date,
  valid_until   date,
  status        text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired','invoiced')),
  notes         text,
  terms         text,
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  vat_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  cost_total    numeric(14,2) not null default 0,   -- internal: what it costs you
  created_by    uuid default auth.uid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create table if not exists public.fin_quote_lines (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.fin_quotes(id) on delete cascade,
  sort        int not null default 0,
  description text not null,
  qty         numeric(12,3) not null default 1,
  unit        text default 'nos',
  unit_price  numeric(14,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  vat_rate    numeric(5,2) not null default 5,
  unit_cost   numeric(14,2) not null default 0,     -- internal cost per unit (margin)
  account_id  uuid references public.fin_accounts(id),
  net_amount  numeric(14,2) generated always as (round(qty * unit_price * (1 - discount_pct/100), 2)) stored,
  vat_amount  numeric(14,2) generated always as (round(round(qty * unit_price * (1 - discount_pct/100), 2) * vat_rate / 100, 2)) stored
);

-- ── Tax invoices & credit notes ────────────────────────────────────────────
create table if not exists public.fin_invoices (
  id             uuid primary key default gen_random_uuid(),
  doc_type       text not null default 'invoice' check (doc_type in ('invoice','credit_note')),
  number         text unique,                       -- given when issued (sequential)
  client_id      uuid not null references public.fin_clients(id),
  store_id       uuid references public.stores(id) on delete set null,
  quote_id       uuid references public.fin_quotes(id) on delete set null,
  work_order_id  uuid references public.work_orders(id) on delete set null,
  credit_for     uuid references public.fin_invoices(id),   -- credit note → original invoice
  subject        text,
  lpo_number     text,                                      -- client's purchase order no.
  issue_date     date not null default current_date,
  supply_date    date,
  due_date       date,
  status         text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','void')),
  notes          text,
  terms          text,
  subtotal       numeric(14,2) not null default 0,
  discount       numeric(14,2) not null default 0,
  vat_amount     numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  cost_total     numeric(14,2) not null default 0,
  amount_paid    numeric(14,2) not null default 0,
  amount_credited numeric(14,2) not null default 0,
  balance        numeric(14,2) generated always as (total - amount_paid - amount_credited) stored,
  issued_at      timestamptz,
  voided_at      timestamptz,
  void_reason    text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create table if not exists public.fin_invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.fin_invoices(id) on delete cascade,
  sort        int not null default 0,
  description text not null,
  qty         numeric(12,3) not null default 1,
  unit        text default 'nos',
  unit_price  numeric(14,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  vat_rate    numeric(5,2) not null default 5,
  unit_cost   numeric(14,2) not null default 0,
  account_id  uuid references public.fin_accounts(id),
  net_amount  numeric(14,2) generated always as (round(qty * unit_price * (1 - discount_pct/100), 2)) stored,
  vat_amount  numeric(14,2) generated always as (round(round(qty * unit_price * (1 - discount_pct/100), 2) * vat_rate / 100, 2)) stored
);

-- ── Payments received from clients ────────────────────────────────────────
create table if not exists public.fin_payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.fin_clients(id),
  invoice_id  uuid references public.fin_invoices(id) on delete set null,
  pay_date    date not null default current_date,
  amount      numeric(14,2) not null check (amount > 0),
  method      text not null default 'bank' check (method in ('bank','cash','cheque','card','other')),
  reference   text,
  account_id  uuid not null references public.fin_accounts(id),   -- bank / cash account it went into
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);

-- ── Vendor bills & expenses ────────────────────────────────────────────────
create table if not exists public.fin_bills (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  vendor_id     uuid references public.vendors(id) on delete set null,
  payee         text,                           -- for expenses without a vendor record
  vendor_ref    text,                           -- vendor's own invoice number
  vendor_trn    text,
  client_id     uuid references public.fin_clients(id) on delete set null,   -- job costing
  work_order_id uuid references public.work_orders(id) on delete set null,
  invoice_id    uuid references public.fin_invoices(id) on delete set null,  -- rebilled on
  bill_date     date not null default current_date,
  due_date      date,
  status        text not null default 'draft' check (status in ('draft','approved','partially_paid','paid','void')),
  notes         text,
  attachment_path text,
  subtotal      numeric(14,2) not null default 0,
  vat_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0,
  balance       numeric(14,2) generated always as (total - amount_paid) stored,
  created_by    uuid default auth.uid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create table if not exists public.fin_bill_lines (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.fin_bills(id) on delete cascade,
  sort        int not null default 0,
  description text not null,
  account_id  uuid not null references public.fin_accounts(id),
  amount      numeric(14,2) not null default 0,       -- net, before VAT
  vat_rate    numeric(5,2) not null default 5,
  vat_amount  numeric(14,2) generated always as (round(amount * vat_rate / 100, 2)) stored
);
create table if not exists public.fin_bill_payments (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.fin_bills(id) on delete cascade,
  pay_date    date not null default current_date,
  amount      numeric(14,2) not null check (amount > 0),
  method      text not null default 'bank' check (method in ('bank','cash','cheque','card','other')),
  reference   text,
  account_id  uuid not null references public.fin_accounts(id),
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);

-- ── General ledger ─────────────────────────────────────────────────────────
create table if not exists public.fin_journal (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null,
  memo         text,
  source_type  text not null default 'manual',   -- manual | invoice | invoice_void | credit_note | payment | bill | bill_void | bill_payment
  source_id    uuid,
  reference    text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz default now()
);
create index if not exists fin_journal_source_idx on public.fin_journal(source_type, source_id);
create index if not exists fin_journal_date_idx on public.fin_journal(entry_date);
create table if not exists public.fin_journal_lines (
  id          uuid primary key default gen_random_uuid(),
  journal_id  uuid not null references public.fin_journal(id) on delete cascade,
  account_id  uuid not null references public.fin_accounts(id),
  debit       numeric(14,2) not null default 0 check (debit >= 0),
  credit      numeric(14,2) not null default 0 check (credit >= 0),
  description text,
  client_id   uuid references public.fin_clients(id) on delete set null,
  vendor_id   uuid references public.vendors(id) on delete set null,
  reconciled_at date,                -- bank reconciliation: cleared on statement
  check (not (debit > 0 and credit > 0))
);
create index if not exists fin_jl_account_idx on public.fin_journal_lines(account_id);
create index if not exists fin_jl_journal_idx on public.fin_journal_lines(journal_id);

create table if not exists public.fin_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.fin_accounts(id),
  statement_date    date not null,
  statement_balance numeric(14,2) not null,
  completed_at      timestamptz default now(),
  created_by        uuid default auth.uid()
);

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.fin_acct(p_key text) returns uuid
language sql stable set search_path = public as $$ select id from fin_accounts where system_key = p_key $$;

create or replace function public.fin_check_lock(p_date date) returns void
language plpgsql stable set search_path = public as $$
declare v_lock date;
begin
  select lock_date into v_lock from fin_settings where id = 1;
  if v_lock is not null and p_date <= v_lock then
    raise exception 'The books are locked up to %. Change the lock date in Finance settings first.', v_lock;
  end if;
end $$;

-- every journal must balance (checked at end of transaction)
create or replace function public.fin_journal_balanced() returns trigger
language plpgsql set search_path = public as $$
declare v_id uuid := coalesce(new.journal_id, old.journal_id); v_d numeric; v_c numeric;
begin
  if not exists (select 1 from fin_journal where id = v_id) then return null; end if;
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_d, v_c from fin_journal_lines where journal_id = v_id;
  if v_d <> v_c then raise exception 'Journal entry does not balance (debit % / credit %)', v_d, v_c; end if;
  return null;
end $$;
drop trigger if exists fin_jl_balanced on public.fin_journal_lines;
create constraint trigger fin_jl_balanced after insert or update or delete on public.fin_journal_lines
  deferrable initially deferred for each row execute function public.fin_journal_balanced();

-- lock date also protects manual journals
create or replace function public.fin_journal_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform fin_check_lock(old.entry_date); end if;
  if tg_op in ('INSERT','UPDATE') then perform fin_check_lock(new.entry_date); return new; end if;
  return old;
end $$;
drop trigger if exists fin_journal_guard on public.fin_journal;
create trigger fin_journal_guard before insert or update or delete on public.fin_journal
  for each row execute function public.fin_journal_guard();

-- remove the automatic journal of a document (blocked if a bank line was reconciled)
create or replace function public.fin_unpost(p_type text, p_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from fin_journal j join fin_journal_lines l on l.journal_id = j.id
             where j.source_type = p_type and j.source_id = p_id and l.reconciled_at is not null) then
    raise exception 'This entry is already reconciled with the bank statement. Un-reconcile it first.';
  end if;
  delete from fin_journal where source_type = p_type and source_id = p_id;
end $$;

-- ── Totals from lines ──────────────────────────────────────────────────────
create or replace function public.fin_quote_totals() returns trigger
language plpgsql set search_path = public as $$
declare v_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  update fin_quotes q set
    subtotal   = coalesce((select sum(round(qty*unit_price,2)) from fin_quote_lines where quote_id = v_id),0),
    discount   = coalesce((select sum(round(qty*unit_price,2) - net_amount) from fin_quote_lines where quote_id = v_id),0),
    vat_amount = coalesce((select sum(vat_amount) from fin_quote_lines where quote_id = v_id),0),
    total      = coalesce((select sum(net_amount + vat_amount) from fin_quote_lines where quote_id = v_id),0),
    cost_total = coalesce((select sum(round(qty*unit_cost,2)) from fin_quote_lines where quote_id = v_id),0),
    updated_at = now()
  where q.id = v_id;
  return null;
end $$;
drop trigger if exists fin_quote_lines_totals on public.fin_quote_lines;
create trigger fin_quote_lines_totals after insert or update or delete on public.fin_quote_lines
  for each row execute function public.fin_quote_totals();

create or replace function public.fin_invoice_totals() returns trigger
language plpgsql set search_path = public as $$
declare v_id uuid := coalesce(new.invoice_id, old.invoice_id); v_status text;
begin
  select status into v_status from fin_invoices where id = v_id;
  if v_status is null then return null; end if;              -- invoice itself is being deleted
  if v_status <> 'draft' then
    raise exception 'An issued invoice cannot be changed. Issue a credit note instead.';
  end if;
  update fin_invoices i set
    subtotal   = coalesce((select sum(round(qty*unit_price,2)) from fin_invoice_lines where invoice_id = v_id),0),
    discount   = coalesce((select sum(round(qty*unit_price,2) - net_amount) from fin_invoice_lines where invoice_id = v_id),0),
    vat_amount = coalesce((select sum(vat_amount) from fin_invoice_lines where invoice_id = v_id),0),
    total      = coalesce((select sum(net_amount + vat_amount) from fin_invoice_lines where invoice_id = v_id),0),
    cost_total = coalesce((select sum(round(qty*unit_cost,2)) from fin_invoice_lines where invoice_id = v_id),0),
    updated_at = now()
  where i.id = v_id;
  return null;
end $$;
drop trigger if exists fin_invoice_lines_totals on public.fin_invoice_lines;
create trigger fin_invoice_lines_totals after insert or update or delete on public.fin_invoice_lines
  for each row execute function public.fin_invoice_totals();

create or replace function public.fin_bill_totals() returns trigger
language plpgsql set search_path = public as $$
declare v_id uuid := coalesce(new.bill_id, old.bill_id); v_status text;
begin
  select status into v_status from fin_bills where id = v_id;
  if v_status is null then return null; end if;
  if v_status <> 'draft' then
    raise exception 'An approved bill cannot be changed. Void it and enter it again.';
  end if;
  update fin_bills b set
    subtotal   = coalesce((select sum(amount) from fin_bill_lines where bill_id = v_id),0),
    vat_amount = coalesce((select sum(vat_amount) from fin_bill_lines where bill_id = v_id),0),
    total      = coalesce((select sum(amount + vat_amount) from fin_bill_lines where bill_id = v_id),0),
    updated_at = now()
  where b.id = v_id;
  return null;
end $$;
drop trigger if exists fin_bill_lines_totals on public.fin_bill_lines;
create trigger fin_bill_lines_totals after insert or update or delete on public.fin_bill_lines
  for each row execute function public.fin_bill_totals();

-- ── Invoice / credit note posting ──────────────────────────────────────────
-- Invoice:     Dr Receivable (total)  /  Cr Revenue per line (net)  /  Cr VAT payable
-- Credit note: the reverse, and it reduces the original invoice's balance
create or replace function public.fin_invoice_before() returns trigger
language plpgsql set search_path = public as $$
declare v_terms int;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- after issue only status / payment fields / notes may change
    if (new.client_id, new.issue_date, new.doc_type, coalesce(new.credit_for::text,''), new.total, new.vat_amount)
       is distinct from (old.client_id, old.issue_date, old.doc_type, coalesce(old.credit_for::text,''), old.total, old.vat_amount) then
      raise exception 'An issued invoice cannot be changed. Issue a credit note instead.';
    end if;
    if new.status = 'draft' then raise exception 'An issued invoice cannot go back to draft.'; end if;
    if old.status = 'void' and new.status <> 'void' then raise exception 'A void invoice cannot be re-opened.'; end if;
  end if;
  if new.status <> 'draft' and (tg_op = 'INSERT' or old.status = 'draft') then
    -- issuing now
    if new.total <= 0 then raise exception 'Add at least one line before issuing.'; end if;
    if new.doc_type = 'credit_note' then
      if new.credit_for is null then raise exception 'A credit note must point to the original invoice.'; end if;
      if not exists (select 1 from fin_invoices o where o.id = new.credit_for and o.doc_type = 'invoice'
                     and o.status in ('issued','partially_paid','paid') and o.client_id = new.client_id) then
        raise exception 'The original invoice must be issued and for the same client.';
      end if;
      if new.total > (select balance from fin_invoices where id = new.credit_for) + 0.004 then
        raise exception 'Credit note (%) is more than what is still open on the invoice (%).', new.total,
          (select balance from fin_invoices where id = new.credit_for);
      end if;
    end if;
    perform fin_check_lock(new.issue_date);
    if new.number is null then new.number := fin_next_number(new.doc_type, new.issue_date); end if;
    new.issued_at := now();
    new.supply_date := coalesce(new.supply_date, new.issue_date);
    if new.due_date is null then
      select coalesce(c.payment_terms_days, s.payment_terms_days) into v_terms
        from fin_settings s left join fin_clients c on c.id = new.client_id where s.id = 1;
      new.due_date := new.issue_date + coalesce(v_terms, 30);
    end if;
  end if;
  -- payment status follows the balance
  if new.status in ('issued','partially_paid','paid') and new.doc_type = 'invoice' then
    new.status := case when new.total - new.amount_paid - new.amount_credited <= 0.004 then 'paid'
                       when new.amount_paid + new.amount_credited > 0 then 'partially_paid' else 'issued' end;
  end if;
  if new.status = 'void' and (tg_op = 'INSERT' or old.status <> 'void') then
    if new.amount_paid > 0 then raise exception 'Remove the payments on this invoice before voiding it.'; end if;
    if exists (select 1 from fin_invoices where credit_for = new.id and status <> 'void') then
      raise exception 'This invoice has credit notes. Void them first.';
    end if;
    new.voided_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fin_invoice_before on public.fin_invoices;
create trigger fin_invoice_before before insert or update on public.fin_invoices
  for each row execute function public.fin_invoice_before();

create or replace function public.fin_post_invoice(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare inv fin_invoices; v_j uuid; v_sign int; v_ar uuid := fin_acct('ar'); v_vat uuid := fin_acct('vat_out'); v_rev uuid := fin_acct('revenue');
begin
  select * into inv from fin_invoices where id = p_id;
  if inv.id is null or inv.status = 'draft' then return; end if;
  if exists (select 1 from fin_journal where source_type in ('invoice','credit_note') and source_id = p_id) then return; end if;
  v_sign := case when inv.doc_type = 'credit_note' then -1 else 1 end;
  insert into fin_journal(entry_date, memo, source_type, source_id, reference)
    values (inv.issue_date, case when v_sign = 1 then 'Tax invoice ' else 'Credit note ' end || inv.number,
            inv.doc_type, inv.id, inv.number) returning id into v_j;
  -- receivable
  insert into fin_journal_lines(journal_id, account_id, debit, credit, client_id, description)
    values (v_j, v_ar, greatest(v_sign*inv.total,0), greatest(-v_sign*inv.total,0), inv.client_id, inv.number);
  -- revenue by account
  insert into fin_journal_lines(journal_id, account_id, debit, credit, client_id, description)
    select v_j, coalesce(l.account_id, v_rev),
           greatest(-v_sign*sum(l.net_amount),0), greatest(v_sign*sum(l.net_amount),0), inv.client_id, inv.number
      from fin_invoice_lines l where l.invoice_id = inv.id
      group by coalesce(l.account_id, v_rev) having sum(l.net_amount) <> 0;
  -- VAT
  if inv.vat_amount <> 0 then
    insert into fin_journal_lines(journal_id, account_id, debit, credit, client_id, description)
      values (v_j, v_vat, greatest(-v_sign*inv.vat_amount,0), greatest(v_sign*inv.vat_amount,0), inv.client_id, 'VAT ' || inv.number);
  end if;
end $$;

create or replace function public.fin_invoice_after() returns trigger
language plpgsql set search_path = public as $$
declare v_j uuid;
begin
  if new.status <> 'draft' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform fin_post_invoice(new.id);
  end if;
  -- void: reversal entry dated today, original stays (audit trail)
  if new.status = 'void' and tg_op = 'UPDATE' and old.status <> 'void' and old.status <> 'draft' then
    perform fin_check_lock(current_date);
    insert into fin_journal(entry_date, memo, source_type, source_id, reference)
      values (current_date, 'VOID ' || new.number || coalesce(' — ' || new.void_reason, ''), 'invoice_void', new.id, new.number)
      returning id into v_j;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, client_id, description)
      select v_j, l.account_id, l.credit, l.debit, l.client_id, 'Reversal ' || coalesce(l.description,'')
        from fin_journal_lines l join fin_journal j on j.id = l.journal_id
       where j.source_type = new.doc_type and j.source_id = new.id;
  end if;
  -- credit note changes the original invoice's credited amount
  if new.doc_type = 'credit_note' and new.credit_for is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update fin_invoices o set amount_credited = coalesce((
      select sum(total) from fin_invoices c where c.credit_for = o.id and c.status not in ('draft','void')),0)
    where o.id = new.credit_for;
  end if;
  return null;
end $$;
drop trigger if exists fin_invoice_after on public.fin_invoices;
create trigger fin_invoice_after after insert or update on public.fin_invoices
  for each row execute function public.fin_invoice_after();

create or replace function public.fin_invoice_delete_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status <> 'draft' then raise exception 'Issued invoices cannot be deleted. Void it or issue a credit note.'; end if;
  return old;
end $$;
drop trigger if exists fin_invoice_delete_guard on public.fin_invoices;
create trigger fin_invoice_delete_guard before delete on public.fin_invoices
  for each row execute function public.fin_invoice_delete_guard();

-- ── Payments received ──────────────────────────────────────────────────────
-- Dr Bank/Cash  /  Cr Receivable
create or replace function public.fin_payment_sync() returns trigger
language plpgsql set search_path = public as $$
declare v_j uuid; r fin_payments; v_bal numeric;
begin
  if tg_op in ('UPDATE','DELETE') then
    perform fin_check_lock(old.pay_date);
    perform fin_unpost('payment', old.id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    r := new;
    perform fin_check_lock(r.pay_date);
    if r.invoice_id is not null then
      select balance + case when tg_op = 'UPDATE' and old.invoice_id = r.invoice_id then old.amount else 0 end
        into v_bal from fin_invoices where id = r.invoice_id and doc_type = 'invoice' and status in ('issued','partially_paid','paid');
      if v_bal is null then raise exception 'Payments can only be applied to an issued invoice.'; end if;
      if r.amount > v_bal + 0.004 then raise exception 'Payment (%) is more than the invoice balance (%).', r.amount, v_bal; end if;
    end if;
    insert into fin_journal(entry_date, memo, source_type, source_id, reference)
      values (r.pay_date, 'Payment received' || coalesce(' — ' || r.reference,''), 'payment', r.id, r.reference) returning id into v_j;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, client_id, description) values
      (v_j, r.account_id, r.amount, 0, r.client_id, 'Received ' || coalesce(r.reference,'')),
      (v_j, fin_acct('ar'), 0, r.amount, r.client_id, 'Received ' || coalesce(r.reference,''));
  end if;
  -- refresh paid amounts on affected invoices
  update fin_invoices i set amount_paid = coalesce((select sum(amount) from fin_payments p where p.invoice_id = i.id),0)
   where i.id in (select x from unnest(array[case when tg_op <> 'INSERT' then old.invoice_id end,
                                              case when tg_op <> 'DELETE' then new.invoice_id end]) x where x is not null);
  return null;
end $$;
drop trigger if exists fin_payment_sync on public.fin_payments;
create trigger fin_payment_sync after insert or update or delete on public.fin_payments
  for each row execute function public.fin_payment_sync();

-- ── Bills ──────────────────────────────────────────────────────────────────
-- Approve: Dr Expense per line / Dr VAT recoverable / Cr Payable
create or replace function public.fin_bill_before() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status not in ('draft') then
    if (new.bill_date, new.total, new.vat_amount, coalesce(new.vendor_id::text,''), coalesce(new.payee,''))
       is distinct from (old.bill_date, old.total, old.vat_amount, coalesce(old.vendor_id::text,''), coalesce(old.payee,'')) then
      raise exception 'An approved bill cannot be changed. Void it and enter it again.';
    end if;
    if new.status = 'draft' then raise exception 'An approved bill cannot go back to draft.'; end if;
    if old.status = 'void' and new.status <> 'void' then raise exception 'A void bill cannot be re-opened.'; end if;
  end if;
  if new.status <> 'draft' and (tg_op = 'INSERT' or old.status = 'draft') then
    if new.total <= 0 then raise exception 'Add at least one line before approving.'; end if;
    if new.vendor_id is null and coalesce(new.payee,'') = '' then raise exception 'Choose a vendor or type who was paid.'; end if;
    perform fin_check_lock(new.bill_date);
    if new.number is null then new.number := fin_next_number('bill', new.bill_date); end if;
    new.due_date := coalesce(new.due_date, new.bill_date + 30);
  end if;
  if new.status in ('approved','partially_paid','paid') then
    new.status := case when new.total - new.amount_paid <= 0.004 then 'paid'
                       when new.amount_paid > 0 then 'partially_paid' else 'approved' end;
  end if;
  if new.status = 'void' and tg_op = 'UPDATE' and old.status <> 'void' and new.amount_paid > 0 then
    raise exception 'Remove the payments on this bill before voiding it.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fin_bill_before on public.fin_bills;
create trigger fin_bill_before before insert or update on public.fin_bills
  for each row execute function public.fin_bill_before();

create or replace function public.fin_bill_after() returns trigger
language plpgsql set search_path = public as $$
declare v_j uuid; b fin_bills := new;
begin
  if b.status <> 'draft' and b.status <> 'void' and (tg_op = 'INSERT' or old.status = 'draft')
     and not exists (select 1 from fin_journal where source_type = 'bill' and source_id = b.id) then
    insert into fin_journal(entry_date, memo, source_type, source_id, reference)
      values (b.bill_date, 'Bill ' || b.number || coalesce(' — ' || b.vendor_ref,''), 'bill', b.id, coalesce(b.vendor_ref, b.number))
      returning id into v_j;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, vendor_id, client_id, description)
      select v_j, l.account_id, sum(l.amount), 0, b.vendor_id, b.client_id, b.number
        from fin_bill_lines l where l.bill_id = b.id group by l.account_id having sum(l.amount) > 0;
    if b.vat_amount > 0 then
      insert into fin_journal_lines(journal_id, account_id, debit, credit, vendor_id, description)
        values (v_j, fin_acct('vat_in'), b.vat_amount, 0, b.vendor_id, 'VAT ' || b.number);
    end if;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, vendor_id, description)
      values (v_j, fin_acct('ap'), 0, b.total, b.vendor_id, b.number);
  end if;
  if tg_op = 'UPDATE' and b.status = 'void' and old.status not in ('void','draft') then
    perform fin_check_lock(current_date);
    insert into fin_journal(entry_date, memo, source_type, source_id, reference)
      values (current_date, 'VOID bill ' || b.number, 'bill_void', b.id, b.number) returning id into v_j;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, vendor_id, client_id, description)
      select v_j, l.account_id, l.credit, l.debit, l.vendor_id, l.client_id, 'Reversal ' || coalesce(l.description,'')
        from fin_journal_lines l join fin_journal j on j.id = l.journal_id
       where j.source_type = 'bill' and j.source_id = b.id;
  end if;
  return null;
end $$;
drop trigger if exists fin_bill_after on public.fin_bills;
create trigger fin_bill_after after insert or update on public.fin_bills
  for each row execute function public.fin_bill_after();

create or replace function public.fin_bill_delete_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status <> 'draft' then raise exception 'Approved bills cannot be deleted. Void it instead.'; end if;
  return old;
end $$;
drop trigger if exists fin_bill_delete_guard on public.fin_bills;
create trigger fin_bill_delete_guard before delete on public.fin_bills
  for each row execute function public.fin_bill_delete_guard();

-- Bill payment: Dr Payable / Cr Bank/Cash
create or replace function public.fin_bill_payment_sync() returns trigger
language plpgsql set search_path = public as $$
declare v_j uuid; r fin_bill_payments; v_bal numeric; v_vendor uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    perform fin_check_lock(old.pay_date);
    perform fin_unpost('bill_payment', old.id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    r := new;
    perform fin_check_lock(r.pay_date);
    select balance + case when tg_op = 'UPDATE' and old.bill_id = r.bill_id then old.amount else 0 end, vendor_id
      into v_bal, v_vendor from fin_bills where id = r.bill_id and status in ('approved','partially_paid','paid');
    if v_bal is null then raise exception 'Approve the bill before paying it.'; end if;
    if r.amount > v_bal + 0.004 then raise exception 'Payment (%) is more than the bill balance (%).', r.amount, v_bal; end if;
    insert into fin_journal(entry_date, memo, source_type, source_id, reference)
      values (r.pay_date, 'Bill payment' || coalesce(' — ' || r.reference,''), 'bill_payment', r.id, r.reference) returning id into v_j;
    insert into fin_journal_lines(journal_id, account_id, debit, credit, vendor_id, description) values
      (v_j, fin_acct('ap'), r.amount, 0, v_vendor, 'Paid ' || coalesce(r.reference,'')),
      (v_j, r.account_id, 0, r.amount, v_vendor, 'Paid ' || coalesce(r.reference,''));
  end if;
  update fin_bills b set amount_paid = coalesce((select sum(amount) from fin_bill_payments p where p.bill_id = b.id),0)
   where b.id in (select x from unnest(array[case when tg_op <> 'INSERT' then old.bill_id end,
                                              case when tg_op <> 'DELETE' then new.bill_id end]) x where x is not null);
  return null;
end $$;
drop trigger if exists fin_bill_payment_sync on public.fin_bill_payments;
create trigger fin_bill_payment_sync after insert or update or delete on public.fin_bill_payments
  for each row execute function public.fin_bill_payment_sync();

-- ── Reporting ──────────────────────────────────────────────────────────────
create or replace view public.fin_ledger with (security_invoker = true) as
select l.id, l.journal_id, j.entry_date, j.memo, j.source_type, j.source_id, j.reference,
       l.account_id, a.code as account_code, a.name as account_name, a.type as account_type,
       l.debit, l.credit, l.description, l.client_id, l.vendor_id, l.reconciled_at
  from public.fin_journal_lines l
  join public.fin_journal j on j.id = l.journal_id
  join public.fin_accounts a on a.id = l.account_id;

-- Trial balance: opening (before p_from), movement in period, closing — natural sign per type
create or replace function public.fin_trial_balance(p_from date, p_to date)
returns table (account_id uuid, code text, name text, type text, subtype text,
               opening numeric, debit numeric, credit numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  with m as (
    select l.account_id,
           sum(case when j.entry_date < p_from then l.debit - l.credit else 0 end) as open_dr,
           sum(case when j.entry_date between p_from and p_to then l.debit else 0 end) as dr,
           sum(case when j.entry_date between p_from and p_to then l.credit else 0 end) as cr
      from fin_journal_lines l join fin_journal j on j.id = l.journal_id
     where j.entry_date <= p_to
     group by l.account_id)
  select a.id, a.code, a.name, a.type, a.subtype,
         round(case when a.type in ('asset','expense') then coalesce(m.open_dr,0) else -coalesce(m.open_dr,0) end, 2),
         round(coalesce(m.dr,0),2), round(coalesce(m.cr,0),2),
         round(case when a.type in ('asset','expense') then coalesce(m.open_dr,0) + coalesce(m.dr,0) - coalesce(m.cr,0)
                    else -coalesce(m.open_dr,0) + coalesce(m.cr,0) - coalesce(m.dr,0) end, 2)
    from fin_accounts a left join m on m.account_id = a.id
   where a.is_active or m.account_id is not null
   order by a.code
$$;

-- ── Security: admin only ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['fin_settings','fin_accounts','fin_clients','fin_counters','fin_quotes','fin_quote_lines',
    'fin_invoices','fin_invoice_lines','fin_payments','fin_bills','fin_bill_lines','fin_bill_payments',
    'fin_journal','fin_journal_lines','fin_reconciliations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on function public.fin_next_number(text, date) from anon, public;
grant execute on function public.fin_next_number(text, date) to authenticated;

-- company logo in storage: admin only, path finance/...
drop policy if exists fx_att_fin_read on storage.objects;
create policy fx_att_fin_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and name like 'finance/%' and public.is_admin());
drop policy if exists fx_att_fin_write on storage.objects;
create policy fx_att_fin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and name like 'finance/%' and public.is_admin());
drop policy if exists fx_att_fin_update on storage.objects;
create policy fx_att_fin_update on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and name like 'finance/%' and public.is_admin());

-- Quotes get their number and validity date automatically
create or replace function public.fin_quote_before() returns trigger
language plpgsql set search_path = public as $$
declare v_days int;
begin
  if new.number is null then new.number := fin_next_number('quote', new.issue_date); end if;
  if new.valid_until is null then
    select quote_valid_days into v_days from fin_settings where id = 1;
    new.valid_until := new.issue_date + coalesce(v_days, 30);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fin_quote_before on public.fin_quotes;
create trigger fin_quote_before before insert or update on public.fin_quotes
  for each row execute function public.fin_quote_before();
