-- Kora Kaagaz invoice generator: initial schema.
-- Single-owner app: every row carries owner_id and RLS limits access to auth.uid().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- settings: one row per owner (business, bank, defaults, numbering)
-- ---------------------------------------------------------------------------
create table public.settings (
  owner_id        uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  business_name   text not null default 'Kora Kaagaz',
  upi_id          text not null default '',
  bank_account_no text not null default '',
  bank_ifsc       text not null default '',
  bank_address    text not null default '',
  pan             text not null default '',
  gstin           text not null default '',
  query_email     text not null default '',
  query_phone     text not null default '',
  invoice_prefix  text not null default 'KK',
  next_number     integer not null default 1 check (next_number > 0),
  default_currency text not null default 'INR',
  default_payment_terms text not null default '100% Final Payment',
  default_gst_mode text not null default 'none' check (default_gst_mode in ('none','cgst_sgst','igst')),
  default_gst_rate numeric(5,2) not null default 18 check (default_gst_rate >= 0),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null check (length(trim(name)) > 0),
  address    text not null default '',
  gstin      text not null default '',
  email      text not null default '',
  phone      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_owner_name_idx on public.clients (owner_id, name);

-- ---------------------------------------------------------------------------
-- invoices: client + payment details are snapshotted so history never drifts
-- ---------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  number          text not null,
  client_id       uuid references public.clients(id) on delete set null,
  client_snapshot jsonb not null default '{}'::jsonb,   -- {name,address,gstin,email,phone}
  payment_snapshot jsonb not null default '{}'::jsonb,  -- copy of settings payment/query fields
  issue_date      date not null default current_date,
  due_date        date,
  currency        text not null default 'INR',
  payment_terms   text not null default '',
  discount_type   text not null default 'none' check (discount_type in ('none','flat','percent')),
  discount_value  numeric(14,2) not null default 0 check (discount_value >= 0),
  gst_mode        text not null default 'none' check (gst_mode in ('none','cgst_sgst','igst')),
  gst_rate        numeric(5,2) not null default 0 check (gst_rate >= 0),
  subtotal        numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  notes           text not null default '',
  status          text not null default 'draft' check (status in ('draft','sent','paid')),
  paid_at         timestamptz,
  pdf_path        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, number)
);
create index invoices_owner_issue_idx on public.invoices (owner_id, issue_date desc);
create index invoices_owner_status_idx on public.invoices (owner_id, status);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  position    integer not null,
  title       text not null default '',
  description text not null default '',
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- next_invoice_number(): atomically reserves the next number for the caller.
-- Row lock on settings makes concurrent calls serialise, so numbers never clash.
-- Format: PREFIX-YYYY-NNN (e.g. KK-2026-001)
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number() returns text
language plpgsql security invoker as $$
declare
  s public.settings%rowtype;
begin
  insert into public.settings (owner_id) values (auth.uid())
    on conflict (owner_id) do nothing;

  select * into s from public.settings where owner_id = auth.uid() for update;

  update public.settings set next_number = s.next_number + 1 where owner_id = auth.uid();

  return s.invoice_prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(s.next_number::text, 3, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.settings      enable row level security;
alter table public.clients       enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

create policy settings_owner on public.settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy clients_owner on public.clients
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy invoices_owner on public.invoices
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy invoice_items_owner on public.invoice_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for generated PDFs, files live under <owner_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('invoices', 'invoices', false)
  on conflict (id) do nothing;

create policy invoices_pdf_owner_read on storage.objects
  for select using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy invoices_pdf_owner_write on storage.objects
  for insert with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy invoices_pdf_owner_update on storage.objects
  for update using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy invoices_pdf_owner_delete on storage.objects
  for delete using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
