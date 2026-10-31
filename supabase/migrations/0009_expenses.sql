-- Expenses: vendors, categories (with GST/ITC/TDS defaults), bills, receipts and team claims,
-- payments, TDS deposits, cash accounts, recurring expenses, rebilling to clients.

-- ---------------------------------------------------------------------------
-- Cash accounts: bank accounts get an opening balance; a petty-cash account
-- ---------------------------------------------------------------------------
alter table public.bank_accounts
  add column kind            text not null default 'bank' check (kind in ('bank', 'cash')),
  add column opening_balance numeric(14,2) not null default 0,
  add column opening_date    date;
insert into public.bank_accounts (label, kind, account_name)
select 'Petty cash', 'cash', 'Petty cash' where not exists (select 1 from public.bank_accounts where kind = 'cash');

alter table public.settings
  add column gst_filing text not null default 'monthly' check (gst_filing in ('monthly', 'qrmp', 'none'));

-- ---------------------------------------------------------------------------
-- Categories and vendors
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(trim(name)) > 0),
  -- how GST input credit normally works for this kind of spend
  itc_rule     text not null default 'eligible' check (itc_rule in ('eligible', 'blocked', 'none')),
  -- pass_through = billed on to clients (freelancers, props, studio hire); overhead = running the studio
  kind         text not null default 'overhead' check (kind in ('overhead', 'pass_through')),
  tds_nature   text not null default 'none',
  rcm          boolean not null default false,
  budget_month numeric(14,2) not null default 0,
  sort         int not null default 0,
  active       boolean not null default true
);

insert into public.expense_categories (name, itc_rule, kind, tds_nature, rcm, sort) values
  ('Rent', 'eligible', 'overhead', 'rent_building', false, 1),
  ('Software & subscriptions', 'eligible', 'overhead', 'none', false, 2),
  ('Equipment & kit', 'eligible', 'overhead', 'none', false, 3),
  ('Props & sets', 'eligible', 'pass_through', 'none', false, 4),
  ('Studio & equipment hire', 'eligible', 'pass_through', 'rent_machinery', false, 5),
  ('Freelancer: photography', 'eligible', 'pass_through', 'professional', false, 6),
  ('Freelancer: design', 'eligible', 'pass_through', 'professional', false, 7),
  ('Models & talent', 'eligible', 'pass_through', 'professional', false, 8),
  ('Printing', 'eligible', 'pass_through', 'contractor', false, 9),
  ('Travel & cabs', 'blocked', 'pass_through', 'none', false, 10),
  ('Meals & refreshments', 'blocked', 'overhead', 'none', false, 11),
  ('Internet & phone', 'eligible', 'overhead', 'none', false, 12),
  ('Utilities', 'none', 'overhead', 'none', false, 13),
  ('Marketing', 'eligible', 'overhead', 'none', false, 14),
  ('Professional fees (CA)', 'eligible', 'overhead', 'professional', false, 15),
  ('Legal fees', 'eligible', 'overhead', 'professional', true, 16),
  ('Bank charges', 'eligible', 'overhead', 'none', false, 17),
  ('Office supplies', 'eligible', 'overhead', 'none', false, 18),
  ('Other', 'eligible', 'overhead', 'none', false, 99);

create table public.vendors (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) > 0),
  kind                text not null default 'vendor' check (kind in ('freelancer', 'vendor', 'landlord', 'utility', 'software', 'other')),
  gstin               text not null default '',
  pan                 text not null default '',
  state_code          text not null default '',
  email               text not null default '',
  phone               text not null default '',
  address             text not null default '',
  bank_details        text not null default '',
  upi_id              text not null default '',
  default_category_id uuid references public.expense_categories(id) on delete set null,
  tds_nature          text not null default 'none',
  is_company          boolean not null default false,
  msme                boolean not null default false,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index vendors_name_idx on public.vendors (lower(name));

-- ---------------------------------------------------------------------------
-- Expenses: bills (pay later), receipts (already paid) and team claims (reimburse)
-- ---------------------------------------------------------------------------
create table public.tds_challans (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,          -- first day of the month the TDS was deducted in
  amount     numeric(14,2) not null check (amount >= 0),
  challan_no text not null default '',
  bsr_code   text not null default '',
  paid_on    date not null,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null default 'receipt' check (kind in ('bill', 'receipt', 'claim')),
  vendor_id            uuid references public.vendors(id) on delete set null,
  vendor_name          text not null default '',
  category_id          uuid not null references public.expense_categories(id),
  expense_date         date not null,
  bill_no              text not null default '',
  description          text not null default '',
  project_id           uuid references public.projects(id) on delete set null,
  client_id            uuid references public.clients(id) on delete set null,
  currency             text not null default 'INR',
  fx_rate              numeric(12,6) not null default 1 check (fx_rate > 0),
  taxable              numeric(14,2) not null default 0 check (taxable >= 0),
  gst_rate             numeric(5,2) not null default 0 check (gst_rate between 0 and 40),
  cgst                 numeric(14,2) not null default 0,
  sgst                 numeric(14,2) not null default 0,
  igst                 numeric(14,2) not null default 0,
  rcm                  boolean not null default false,
  total                numeric(14,2) not null default 0,   -- what the bill says (GST included unless RCM)
  itc_status           text not null default 'eligible' check (itc_status in ('eligible', 'blocked', 'ineligible')),
  gstr2b               text not null default 'not_checked' check (gstr2b in ('not_checked', 'matched', 'mismatch', 'missing')),
  itc_month            date,
  tds_nature           text not null default 'none',
  tds_rate             numeric(5,2) not null default 0 check (tds_rate between 0 and 30),
  tds_amount           numeric(14,2) not null default 0 check (tds_amount >= 0),
  tds_challan_id       uuid references public.tds_challans(id) on delete set null,
  paid_from            text not null default 'bank' check (paid_from in ('bank', 'petty_cash', 'member')),
  paid_by_email        text references public.members(email) on update cascade on delete set null,
  approval             text check (approval in ('submitted', 'approved', 'rejected')),
  approval_note        text not null default '',
  decided_by           text,
  decided_at           timestamptz,
  due_date             date,
  billable             boolean not null default false,
  markup_pct           numeric(6,2) not null default 0 check (markup_pct >= 0),
  invoiced_document_id uuid references public.documents(id) on delete set null,
  recurring            jsonb,                -- {"every": "month"|"quarter"|"year", "next": "yyyy-mm-dd"}
  recurring_source_id  uuid references public.expenses(id) on delete set null,
  is_draft             boolean not null default false,   -- recurring copies wait for a person to confirm
  receipt_path         text,
  receipt_name         text not null default '',
  notes                text not null default '',
  created_by           text not null default public.my_email(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (kind <> 'claim' or (paid_from = 'member' and approval is not null)),
  check (vendor_id is not null or length(trim(vendor_name)) > 0 or kind = 'claim')
);
create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_project_idx on public.expenses (project_id) where project_id is not null;
create index expenses_vendor_idx on public.expenses (vendor_id);
create index expenses_claims_idx on public.expenses (created_by) where kind = 'claim';

create table public.expense_payments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  paid_on    date not null,
  amount     numeric(14,2) not null check (amount > 0),
  mode       text not null default 'bank' check (mode in ('upi', 'bank', 'cash', 'card', 'cheque')),
  account_id uuid references public.bank_accounts(id) on delete set null,
  reference  text not null default '',
  created_at timestamptz not null default now()
);
create index expense_payments_expense_idx on public.expense_payments (expense_id);

-- What's owed and paid on each expense. Payable = total − TDS deducted; with reverse charge the
-- vendor's bill has no GST (we pay it to the government), so total is the taxable value.
create or replace view public.expense_balances with (security_invoker = true) as
select e.id as expense_id,
       round(e.total - e.tds_amount, 2) as payable,
       coalesce(sum(p.amount), 0) as paid,
       round(e.total - e.tds_amount - coalesce(sum(p.amount), 0), 2) as balance,
       max(p.paid_on) as last_paid_on
  from public.expenses e left join public.expense_payments p on p.expense_id = e.id
 group by e.id;

-- updated_at
create trigger vendors_touch before update on public.vendors for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();

-- Only the admin decides claims; nobody approves their own (the admin's own claims excepted, there
-- is nobody above them). Paid or invoiced expenses keep their amounts.
create or replace function public.guard_expense() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.expense_payments where expense_id = old.id) then
      raise exception 'this expense has payments; remove them first' using errcode = '42501';
    end if;
    if old.invoiced_document_id is not null then
      raise exception 'this expense is on an invoice' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.approval is distinct from old.approval and new.approval in ('approved', 'rejected') then
    if not public.is_admin() then raise exception 'only the admin approves claims' using errcode = '42501'; end if;
    new.decided_by = public.my_email(); new.decided_at = now();
  end if;
  if old.invoiced_document_id is not null and old.invoiced_document_id is not distinct from new.invoiced_document_id
     and (new.taxable, new.total, new.markup_pct, new.billable) is distinct from (old.taxable, old.total, old.markup_pct, old.billable) then
    raise exception 'this expense is on an invoice; its amounts are locked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger expenses_guard before update or delete on public.expenses
  for each row execute function public.guard_expense();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
create policy expense_categories_read on public.expense_categories for select to authenticated using (public.is_team());
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.vendors enable row level security;
create policy vendors_read on public.vendors for select to authenticated using (public.is_member());
create policy vendors_write on public.vendors for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.tds_challans enable row level security;
create policy tds_challans_read on public.tds_challans for select to authenticated using (public.is_member());
create policy tds_challans_write on public.tds_challans for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.expenses enable row level security;
-- staff see everything; anyone sees their own claims
create policy expenses_read on public.expenses for select to authenticated
  using (public.is_member() or (kind = 'claim' and created_by = public.my_email()));
-- editors log any expense; anyone on the team (not viewers) files their own claims
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    public.can_edit()
    or (kind = 'claim' and created_by = public.my_email() and paid_by_email = public.my_email()
        and approval = 'submitted' and public.my_role() = 'freelancer'
        and (project_id is null or public.on_project(project_id)))
  );
create policy expenses_update_staff on public.expenses for update to authenticated
  using (public.can_edit()) with check (public.can_edit());
-- claim owners can fix and resubmit until it's approved
create policy expenses_update_own on public.expenses for update to authenticated
  using (kind = 'claim' and created_by = public.my_email() and approval in ('submitted', 'rejected'))
  with check (kind = 'claim' and created_by = public.my_email() and approval = 'submitted');
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.can_edit() or (kind = 'claim' and created_by = public.my_email() and approval in ('submitted', 'rejected')));

alter table public.expense_payments enable row level security;
create policy expense_payments_read on public.expense_payments for select to authenticated
  using (public.is_member() or exists (select 1 from public.expenses e where e.id = expense_id and e.kind = 'claim' and e.created_by = public.my_email()));
-- only the admin moves money
create policy expense_payments_write on public.expense_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- receipts live at files/expenses/<expense id>/<file>
create or replace function public.can_read_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.on_project(parts[2]::uuid); end if;
  if parts[1] = 'expenses' and parts[2] ~ '^[0-9a-f-]{36}$' then
    return public.is_member() or exists (select 1 from public.expenses e where e.id = parts[2]::uuid and e.created_by = public.my_email());
  end if;
  return public.is_member();
end $$;

create or replace function public.can_write_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.can_work(parts[2]::uuid); end if;
  if parts[1] = 'expenses' and parts[2] ~ '^[0-9a-f-]{36}$' then
    return public.can_edit() or exists (select 1 from public.expenses e where e.id = parts[2]::uuid and e.created_by = public.my_email() and e.kind = 'claim' and e.approval <> 'approved');
  end if;
  return public.can_edit();
end $$;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_row();
create trigger audit_expense_payments after insert or delete on public.expense_payments
  for each row execute function public.audit_row();
create trigger audit_vendors after insert or update or delete on public.vendors
  for each row execute function public.audit_row();
create trigger audit_tds_challans after insert or update or delete on public.tds_challans
  for each row execute function public.audit_row();
