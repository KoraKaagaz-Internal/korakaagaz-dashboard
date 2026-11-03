-- Only the admin moves money: 0010 still let members record payments on bills.
drop policy if exists expense_payments_write on public.expense_payments;
create policy expense_payments_write on public.expense_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Invoicing from time is gone (0014); members no longer touch approved time at all.
drop policy if exists time_invoice on public.time_entries;
