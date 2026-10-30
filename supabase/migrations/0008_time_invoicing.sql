-- Editors can link approved time to the invoice drafted from it; nothing else on approved time.
create policy time_invoice on public.time_entries for update to authenticated
  using (public.can_edit() and status = 'approved')
  with check (public.can_edit() and status = 'approved');

create or replace function public.guard_time_entry() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.status = 'approved' or old.invoiced_document_id is not null then
      raise exception 'approved time can''t be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.invoiced_document_id is not null and (new.minutes, new.billable, new.project_id, new.work_date) is distinct from (old.minutes, old.billable, old.project_id, old.work_date) then
    raise exception 'invoiced time is locked' using errcode = '42501';
  end if;
  -- non-admins may only link/unlink approved time to an invoice
  if old.status = 'approved' and not public.is_admin()
     and (to_jsonb(new) - 'invoiced_document_id' - 'updated_at') is distinct from (to_jsonb(old) - 'invoiced_document_id' - 'updated_at') then
    raise exception 'approved time is locked' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    new.decided_by = public.my_email(); new.decided_at = now();
  end if;
  return new;
end $$;
