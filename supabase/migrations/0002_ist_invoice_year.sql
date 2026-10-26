-- Use India time for the year in invoice numbers (database clock is UTC).
create or replace function public.next_invoice_number() returns text
language plpgsql security invoker as $$
declare
  s public.settings%rowtype;
begin
  insert into public.settings (owner_id) values (auth.uid())
    on conflict (owner_id) do nothing;

  select * into s from public.settings where owner_id = auth.uid() for update;

  update public.settings set next_number = s.next_number + 1 where owner_id = auth.uid();

  return s.invoice_prefix || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(s.next_number::text, 3, '0');
end $$;
