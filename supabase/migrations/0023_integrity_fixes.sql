-- Integrity fixes from the 2026-11-15 audit.

-- 1. Deleting a client no longer silently deletes its projects (with their tasks, files, time and
--    fees) or its project files: they lose the link instead. Only the admin deletes clients.
alter table public.projects drop constraint if exists projects_client_id_fkey;
alter table public.projects add constraint projects_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;
alter table public.files drop constraint if exists files_client_id_fkey;
alter table public.files add constraint files_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated using (public.is_admin());

-- 2. A credit note must credit an issued invoice, and never more than that invoice's total
--    (all issued credit notes together). The invoice row is locked while this is checked.
create or replace function public.credit_note_within_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_src public.documents%rowtype; v_credited numeric;
begin
  if new.doc_type <> 'credit_note' or new.status <> 'issued' or (tg_op = 'UPDATE' and old.status = 'issued') then
    return new;
  end if;
  select * into v_src from public.documents where id = new.source_id for update;
  if v_src.id is null or v_src.doc_type <> 'invoice' or v_src.status <> 'issued' then
    raise exception 'A credit note must be for an issued invoice';
  end if;
  select coalesce(sum(total), 0) into v_credited from public.documents
   where doc_type = 'credit_note' and status = 'issued' and source_id = new.source_id and id <> new.id;
  if v_credited + new.total > v_src.total + 0.01 then
    raise exception 'Credit notes can''t add up to more than the invoice (% left to credit)', round(v_src.total - v_credited, 2);
  end if;
  return new;
end $$;
drop trigger if exists credit_note_within_invoice on public.documents;
create trigger credit_note_within_invoice before insert or update of status, total on public.documents
  for each row execute function public.credit_note_within_invoice();

-- 3. Bills and claims can't be paid past what's owed, even on a double-click or two people at once.
create or replace function public.expense_payment_within_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_payable numeric; v_paid numeric;
begin
  select total - tds_amount into v_payable from public.expenses where id = new.expense_id for update;
  select coalesce(sum(amount), 0) into v_paid from public.expense_payments where expense_id = new.expense_id and id <> new.id;
  if new.amount > v_payable - v_paid + 0.5 then
    raise exception 'That''s more than the % still owed', round(v_payable - v_paid, 2);
  end if;
  return new;
end $$;
drop trigger if exists expense_payment_within_balance on public.expense_payments;
create trigger expense_payment_within_balance before insert or update on public.expense_payments
  for each row execute function public.expense_payment_within_balance();

-- 4. Public booking page: limit bookings (not just new leads) per visitor, and let only one
--    booking take a slot even when two people click at the same moment.
alter table public.events add column if not exists booked_ip text;
create unique index if not exists events_one_booking_per_slot on public.events (starts_at)
  where booked_ip is not null and status <> 'cancelled';
