-- Payments: the database itself stops duplicates and overpaid invoices.

-- 1. Card and "other" are real ways clients pay.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%mode%'
  loop
    execute format('alter table public.payments drop constraint %I', c);
  end loop;
end $$;
alter table public.payments add constraint payments_mode_check
  check (mode in ('upi', 'bank', 'cash', 'cheque', 'card', 'wire', 'other', 'advance'));

-- 2. One id per "Record" click: a double-click or a retry after a timeout can't save the payment twice.
alter table public.payments add column if not exists request_id uuid;
create unique index if not exists payments_request_idx on public.payments (request_id);

-- 3. An invoice can't be paid past its balance, even when two people record at the same moment:
--    the invoice row is locked while the balance is checked.
create or replace function public.payment_within_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric; v_credited numeric;
begin
  if new.document_id is null then return new; end if;
  select total into v_total from public.documents where id = new.document_id for update;
  select coalesce(sum(amount + tds_amount), 0) into v_paid from public.payments
   where document_id = new.document_id and id <> new.id;
  select coalesce(sum(total), 0) into v_credited from public.documents
   where doc_type = 'credit_note' and status = 'issued' and source_id = new.document_id;
  if new.amount + new.tds_amount > v_total - v_paid - v_credited + 0.01 then
    raise exception 'That is more than the balance due (%)', round(v_total - v_paid - v_credited, 2);
  end if;
  return new;
end $$;
drop trigger if exists payment_within_balance on public.payments;
create trigger payment_within_balance before insert or update on public.payments
  for each row execute function public.payment_within_balance();
