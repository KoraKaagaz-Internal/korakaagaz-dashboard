-- Editors record payments on bills and receipts; reimbursing team claims stays with the admin.
drop policy if exists expense_payments_write on public.expense_payments;
create policy expense_payments_write on public.expense_payments for all to authenticated
  using (public.is_admin() or (public.can_edit() and exists (select 1 from public.expenses e where e.id = expense_id and e.kind <> 'claim')))
  with check (public.is_admin() or (public.can_edit() and exists (select 1 from public.expenses e where e.id = expense_id and e.kind <> 'claim')));
