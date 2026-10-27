-- v2: invite-only team workspace, document types, GST Rule 46 fields, payments/TDS,
-- projects, items catalog, share links, audit log.
-- v1 tables were empty when this ran (verified), so they are dropped and rebuilt.

-- ---------------------------------------------------------------------------
-- Drop v1
-- ---------------------------------------------------------------------------
drop table if exists public.invoice_items cascade;
drop table if exists public.invoices cascade;
drop table if exists public.clients cascade;
drop table if exists public.settings cascade;
drop function if exists public.next_invoice_number();
drop policy if exists invoices_pdf_owner_read on storage.objects;
drop policy if exists invoices_pdf_owner_write on storage.objects;
drop policy if exists invoices_pdf_owner_update on storage.objects;
drop policy if exists invoices_pdf_owner_delete on storage.objects;

-- The single-owner gmail login is retired; team@korakaagaz.co becomes the admin.
delete from auth.users where email = 'ashmitknayak@gmail.com';

-- ---------------------------------------------------------------------------
-- Members and roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'member', 'viewer');

create table public.members (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id    uuid unique references auth.users(id) on delete set null,
  role       public.app_role not null default 'member',
  name       text not null default '',
  invited_by text,
  invited_at timestamptz not null default now(),
  joined_at  timestamptz
);
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;

insert into public.members (email, role, invited_by, invited_at)
values ('team@korakaagaz.co', 'admin', 'setup', now());

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.members where email = public.my_email()
$$;

create or replace function public.is_member() returns boolean
language sql stable as $$ select public.my_role() is not null $$;

create or replace function public.can_edit() returns boolean
language sql stable as $$ select public.my_role() in ('admin', 'member') $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() = 'admin' $$;

create or replace function public.require_admin() returns void
language plpgsql stable as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
end $$;

-- Hard gate: nobody can create an account unless invited.
create or replace function public.gate_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where email = lower(new.email)) then
    raise exception 'not_invited: % is not invited', new.email using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gate_new_user before insert on auth.users
  for each row execute function public.gate_new_user();

create or replace function public.link_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.members
     set user_id = new.id,
         joined_at = coalesce(joined_at, now()),
         name = case when name = '' then coalesce(new.raw_user_meta_data ->> 'full_name', '') else name end
   where email = lower(new.email);
  return new;
end $$;
create trigger link_new_user after insert on auth.users
  for each row execute function public.link_new_user();

-- Member RPCs (admin only)
create or replace function public.team_members()
returns table (email text, role public.app_role, name text, invited_by text, invited_at timestamptz, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  return query select m.email, m.role, m.name, m.invited_by, m.invited_at, m.joined_at
                 from public.members m order by (m.role = 'admin') desc, m.joined_at nulls last, m.email;
end $$;

create or replace function public.admin_invite(p_email text, p_role public.app_role) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  perform public.require_admin();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if p_role = 'admin' then raise exception 'only one admin is allowed'; end if;
  if exists (select 1 from public.members where email = e) then
    if exists (select 1 from public.members where email = e and role = 'admin') then
      raise exception 'cannot change the admin';
    end if;
    update public.members set role = p_role where email = e;
    return 'updated';
  end if;
  insert into public.members (email, role, invited_by) values (e, p_role, public.my_email());
  return 'invited';
end $$;

create or replace function public.admin_remove_member(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(p_email)); uid uuid;
begin
  perform public.require_admin();
  if exists (select 1 from public.members where email = e and role = 'admin') then
    raise exception 'cannot remove the admin';
  end if;
  select user_id into uid from public.members where email = e;
  delete from public.members where email = e;
  -- deleting the auth user ends their sessions immediately
  if uid is not null then delete from auth.users where id = uid; end if;
end $$;

revoke execute on function public.team_members(), public.admin_invite(text, public.app_role),
  public.admin_remove_member(text) from public, anon;
grant execute on function public.team_members(), public.admin_invite(text, public.app_role),
  public.admin_remove_member(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (single row) and bank accounts
-- ---------------------------------------------------------------------------
create table public.settings (
  id                    int primary key default 1 check (id = 1),
  business_name         text not null default 'Kora Kaagaz',
  legal_name            text not null default '',
  address               text not null default '',
  state_code            text not null default '21',  -- Odisha
  gstin                 text not null default '',
  pan                   text not null default '',
  lut_number            text not null default '',
  lut_fy                text not null default '',
  signatory_name        text not null default '',
  signature_path        text,
  query_email           text not null default 'team@korakaagaz.co',
  query_phone           text not null default '',
  prefixes              jsonb not null default '{"invoice":"KK","quote":"QT","proforma":"PI","receipt":"RV","credit_note":"CN"}',
  default_currency      text not null default 'INR',
  default_due_days      int not null default 7,
  default_sac           text not null default '998391',
  default_gst_rate      numeric(5,2) not null default 18,
  require_approval      boolean not null default false,
  reminders_enabled     boolean not null default true,
  terms                 jsonb not null default '{}',
  message_templates     jsonb not null default '{}',
  updated_at            timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  label          text not null default 'Primary',
  account_name   text not null default '',
  account_no     text not null default '',
  ifsc           text not null default '',
  bank_name      text not null default '',
  branch_address text not null default '',
  swift          text not null default '',
  iban           text not null default '',
  upi_id         text not null default '',
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index bank_accounts_one_default on public.bank_accounts (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- Clients, projects, items
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  email      text not null default '',
  cc_emails  text not null default '',
  phone      text not null default '',
  address    text not null default '',
  city       text not null default '',
  pin        text not null default '',
  state_code text not null default '',   -- '' when abroad
  country    text not null default 'India',
  gstin      text not null default '',
  notes      text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_idx on public.clients (lower(name));

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  budget     numeric(14,2) not null default 0,
  status     text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text not null default '',
  sac         text not null default '998391',
  unit_price  numeric(14,2) not null default 0,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents (invoice, quote, proforma, receipt voucher, credit note)
-- ---------------------------------------------------------------------------
create type public.doc_type as enum ('invoice', 'quote', 'proforma', 'receipt', 'credit_note');
create type public.doc_status as enum ('draft', 'awaiting_approval', 'issued', 'accepted', 'declined', 'expired', 'cancelled');

create table public.doc_counters (
  doc_type public.doc_type not null,
  fy       text not null,
  next_seq int not null default 1,
  primary key (doc_type, fy)
);

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  doc_type          public.doc_type not null default 'invoice',
  status            public.doc_status not null default 'draft',
  number            text check (number is null or (length(number) <= 16 and number ~ '^[A-Za-z0-9/-]+$')),
  fy                text,
  client_id         uuid references public.clients(id) on delete set null,
  client_snapshot   jsonb not null default '{}',
  supplier_snapshot jsonb not null default '{}',
  bank_account_id   uuid references public.bank_accounts(id) on delete set null,
  project_id        uuid references public.projects(id) on delete set null,
  source_id         uuid references public.documents(id) on delete set null,
  source_relation   text check (source_relation in ('converted_from', 'credit_for', 'revision_of', 'duplicated_from', 'recurring_from')),
  issue_date        date not null default (now() at time zone 'Asia/Kolkata')::date,
  due_date          date,
  valid_until       date,
  currency          text not null default 'INR',
  fx_rate           numeric(14,6) not null default 1 check (fx_rate > 0), -- INR per 1 unit of currency
  place_of_supply   text not null default '',  -- state code, or '96' for outside India
  reverse_charge    boolean not null default false,
  export_type       text not null default 'none' check (export_type in ('none', 'lut', 'igst')),
  gst_mode          text not null default 'none' check (gst_mode in ('none', 'cgst_sgst', 'igst')),
  gst_rate          numeric(5,2) not null default 18 check (gst_rate >= 0),
  discount_type     text not null default 'none' check (discount_type in ('none', 'flat', 'percent')),
  discount_value    numeric(14,2) not null default 0 check (discount_value >= 0),
  round_off         boolean not null default true,
  subtotal          numeric(14,2) not null default 0,
  discount_amount   numeric(14,2) not null default 0,
  taxable           numeric(14,2) not null default 0,
  cgst              numeric(14,2) not null default 0,
  sgst              numeric(14,2) not null default 0,
  igst              numeric(14,2) not null default 0,
  round_off_amount  numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  notes             text not null default '',
  terms             text not null default '',
  custom_fields     jsonb not null default '[]',
  payment_terms     text not null default '',
  reminders_enabled boolean not null default true,
  recurring         jsonb,           -- {"every":"month"|"quarter","next":"YYYY-MM-DD"}
  lost_reason       text not null default '',
  share_token       text unique default encode(extensions.gen_random_bytes(16), 'hex'),
  share_enabled     boolean not null default true,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        int not null default 0,
  issued_at         timestamptz,
  sent_at           timestamptz,
  accepted_at       timestamptz,
  pdf_path          text,
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (doc_type, fy, number)
);
create index documents_type_date_idx on public.documents (doc_type, issue_date desc);
create index documents_client_idx on public.documents (client_id);
create index documents_status_idx on public.documents (status);

create table public.document_items (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  position    int not null,
  title       text not null default '',
  description text not null default '',
  sac         text not null default '',
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0
);
create index document_items_doc_idx on public.document_items (document_id, position);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  paid_on     date not null default (now() at time zone 'Asia/Kolkata')::date,
  amount      numeric(14,2) not null default 0 check (amount >= 0),
  tds_amount  numeric(14,2) not null default 0 check (tds_amount >= 0),
  tds_section text not null default '',
  mode        text not null default 'upi' check (mode in ('upi', 'bank', 'cash', 'cheque', 'wire', 'advance')),
  reference   text not null default '',
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (amount + tds_amount > 0)
);
create index payments_doc_idx on public.payments (document_id);

create table public.email_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  kind        text not null check (kind in ('document', 'reminder', 'statement', 'invite', 'recurring')),
  to_email    text not null,
  subject     text not null default '',
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  error       text not null default '',
  sent_by     uuid references auth.users(id) on delete set null default auth.uid(),
  sent_at     timestamptz not null default now()
);
create index email_log_doc_idx on public.email_log (document_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- Balances (invoices: payments + credit notes; overdue)
-- ---------------------------------------------------------------------------
create or replace view public.document_balances with (security_invoker = true) as
select d.id,
       d.total,
       coalesce(p.paid, 0)      as paid,
       coalesce(p.tds, 0)       as tds,
       coalesce(c.credited, 0)  as credited,
       greatest(d.total - coalesce(p.paid, 0) - coalesce(p.tds, 0) - coalesce(c.credited, 0), 0) as balance,
       case
         when d.doc_type not in ('invoice', 'proforma') or d.status in ('draft', 'awaiting_approval', 'cancelled') then null
         when d.total - coalesce(p.paid, 0) - coalesce(p.tds, 0) - coalesce(c.credited, 0) <= 0.005 then 'paid'
         when coalesce(p.paid, 0) + coalesce(p.tds, 0) + coalesce(c.credited, 0) > 0 then 'partial'
         else 'unpaid'
       end as payment_status,
       (d.doc_type = 'invoice' and d.status = 'issued' and d.due_date is not null
         and d.due_date < (now() at time zone 'Asia/Kolkata')::date
         and d.total - coalesce(p.paid, 0) - coalesce(p.tds, 0) - coalesce(c.credited, 0) > 0.005) as overdue
  from public.documents d
  left join (select document_id, sum(amount) paid, sum(tds_amount) tds from public.payments group by document_id) p
         on p.document_id = d.id
  left join (select source_id, sum(total) credited from public.documents
              where doc_type = 'credit_note' and status = 'issued' group by source_id) c
         on c.source_id = d.id;

-- ---------------------------------------------------------------------------
-- Numbering: PREFIX/FY/NNN, reset every 1 April, unique per type + FY
-- ---------------------------------------------------------------------------
create or replace function public.fy_of(d date) returns text
language sql immutable as $$
  select case when extract(month from d) >= 4
              then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
              else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end
$$;

create or replace function public.next_doc_number(p_type public.doc_type, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_fy text := public.fy_of(p_date); v_seq int; v_prefix text;
begin
  if not public.can_edit() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.doc_counters (doc_type, fy) values (p_type, v_fy) on conflict do nothing;
  update public.doc_counters set next_seq = next_seq + 1
   where doc_type = p_type and fy = v_fy returning next_seq - 1 into v_seq;
  select coalesce(prefixes ->> p_type::text, 'KK') into v_prefix from public.settings where id = 1;
  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 3, '0');
end $$;
revoke execute on function public.next_doc_number(public.doc_type, date) from public, anon;
grant execute on function public.next_doc_number(public.doc_type, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Locking: issued documents cannot change their content (GST: cancel or credit note instead)
-- ---------------------------------------------------------------------------
create or replace function public.lock_issued_document() returns trigger
language plpgsql as $$
begin
  if old.status not in ('draft', 'awaiting_approval') and (
       new.client_snapshot is distinct from old.client_snapshot or
       new.supplier_snapshot is distinct from old.supplier_snapshot or
       new.issue_date is distinct from old.issue_date or
       new.number is distinct from old.number or
       new.total is distinct from old.total or
       new.taxable is distinct from old.taxable or
       new.currency is distinct from old.currency or
       new.doc_type is distinct from old.doc_type or
       new.place_of_supply is distinct from old.place_of_supply) then
    raise exception 'document % is issued and locked; cancel it or issue a credit note', old.number
      using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger lock_issued_document before update on public.documents
  for each row execute function public.lock_issued_document();

create or replace function public.lock_issued_items() returns trigger
language plpgsql as $$
declare st public.doc_status;
begin
  if current_user = 'service_role' then return coalesce(new, old); end if;
  select status into st from public.documents where id = coalesce(new.document_id, old.document_id);
  if st is not null and st not in ('draft', 'awaiting_approval') then
    raise exception 'document is issued and locked' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger lock_issued_items before insert or update or delete on public.document_items
  for each row execute function public.lock_issued_items();

-- Only drafts can be deleted; issued documents are cancelled.
create or replace function public.protect_issued_delete() returns trigger
language plpgsql as $$
begin
  if current_user = 'service_role' then return old; end if;
  if old.status not in ('draft', 'awaiting_approval') then
    raise exception 'issued documents cannot be deleted; cancel instead' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger protect_issued_delete before delete on public.documents
  for each row execute function public.protect_issued_delete();

-- ---------------------------------------------------------------------------
-- Public share links: anon can read exactly one document by its token
-- ---------------------------------------------------------------------------
create or replace function public.shared_document(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; result jsonb;
begin
  select * into d from public.documents
   where share_token = p_token and share_enabled and status not in ('draft', 'awaiting_approval');
  if not found then return null; end if;
  update public.documents
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where id = d.id;
  select to_jsonb(d) - 'created_by' - 'share_token'
         || jsonb_build_object(
              'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.document_items i where i.document_id = d.id), '[]'),
              'balance', (select to_jsonb(b) from public.document_balances b where b.id = d.id),
              'bank', (select to_jsonb(ba) from public.bank_accounts ba where ba.id = d.bank_account_id))
    into result;
  return result;
end $$;

create or replace function public.shared_accept_quote(p_token text, p_accept boolean, p_reason text default '') returns text
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where share_token = p_token and share_enabled;
  if not found or d.doc_type <> 'quote' or d.status <> 'issued' then return 'unavailable'; end if;
  update public.documents
     set status = case when p_accept then 'accepted'::public.doc_status else 'declined'::public.doc_status end,
         accepted_at = case when p_accept then now() else null end,
         lost_reason = case when p_accept then '' else left(coalesce(p_reason, ''), 500) end
   where id = d.id;
  insert into public.audit_events (actor_email, entity, entity_id, action, diff)
  values ('client (share link)', 'documents', d.id, case when p_accept then 'quote_accepted' else 'quote_declined' end,
          jsonb_build_object('reason', p_reason));
  return case when p_accept then 'accepted' else 'declined' end;
end $$;
grant execute on function public.shared_document(text), public.shared_accept_quote(text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid default auth.uid(),
  actor_email text default public.my_email(),
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  diff        jsonb not null default '{}'
);
create index audit_events_entity_idx on public.audit_events (entity, entity_id, at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_diff jsonb := '{}'; k text; o jsonb; n jsonb; v_action text := lower(tg_op); v_id uuid;
        v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'view_count', 'last_viewed_at', 'first_viewed_at')
         and (o -> k) is distinct from (n -> k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if v_diff = '{}' then return new; end if;
    if tg_table_name = 'documents' and (o ->> 'status') is distinct from (n ->> 'status') then
      v_action := 'status_' || (n ->> 'status');
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := to_jsonb(new);
  else
    v_diff := to_jsonb(old);
  end if;
  v_id := case when tg_table_name = 'payments' then (v_row ->> 'document_id')::uuid
               when tg_table_name in ('settings', 'members') then null
               else (v_row ->> 'id')::uuid end;
  insert into public.audit_events (entity, entity_id, action, diff)
  values (tg_table_name, v_id, case when tg_table_name = 'payments' then 'payment_' || v_action else v_action end, v_diff);
  return coalesce(new, old);
end $$;

create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function public.audit_row();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row();
create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function public.audit_row();
create trigger audit_settings after update on public.settings
  for each row execute function public.audit_row();
create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.audit_row();

-- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: members read; admin + members write; settings/banks admin only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients', 'projects', 'items', 'documents', 'document_items', 'payments', 'email_log', 'doc_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit()) with check (public.can_edit())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit())', t || '_delete', t);
  end loop;
  foreach t in array array['settings', 'bank_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

alter table public.audit_events enable row level security;
create policy audit_read on public.audit_events for select to authenticated using (public.is_member());
create policy audit_insert on public.audit_events for insert to authenticated with check (public.is_member());
revoke update, delete, truncate on public.audit_events from anon, authenticated;
revoke all on public.doc_counters from anon;
revoke all on public.members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: PDFs + brand assets (signature), members read, editors write
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('brand', 'brand', false) on conflict (id) do nothing;

create policy team_files_read on storage.objects for select to authenticated
  using (bucket_id in ('invoices', 'brand') and public.is_member());
create policy team_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('invoices', 'brand') and public.can_edit());
create policy team_files_update on storage.objects for update to authenticated
  using (bucket_id in ('invoices', 'brand') and public.can_edit());
create policy team_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('invoices', 'brand') and public.can_edit());
