-- Members run projects and sales; the studio's money, pay and private HR data are admin only.
-- Viewers see what members see, read-only. Freelancers are unchanged (their projects only).
--
-- Also closes holes where the database allowed more than the app: self-approved claims and time,
-- skipping invoice approval, member deletes of projects/leads/files, forged audit entries, and
-- calendar-feed tokens readable in the audit log.

-- ---------------------------------------------------------------------------
-- 1. Audit log: never store calendar-feed tokens; members read project and sales activity only
-- ---------------------------------------------------------------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_diff jsonb := '{}'; k text; o jsonb; n jsonb; v_action text := lower(tg_op); v_id uuid; v_project uuid;
        v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'view_count', 'last_viewed_at', 'first_viewed_at', 'sort', 'completed_at', 'ics_token')
         and (o -> k) is distinct from (n -> k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if v_diff = '{}' then return new; end if;
    if tg_table_name in ('documents', 'tasks', 'projects') and (o ->> 'status') is distinct from (n ->> 'status') then
      v_action := 'status_' || (n ->> 'status');
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := to_jsonb(new) - 'ics_token';
  else
    v_diff := to_jsonb(old) - 'ics_token';
  end if;
  v_id := case when tg_table_name = 'payments' then (v_row ->> 'document_id')::uuid
               when tg_table_name = 'task_comments' then (v_row ->> 'task_id')::uuid
               when tg_table_name = 'project_finance' then (v_row ->> 'project_id')::uuid
               when tg_table_name in ('settings', 'members') then null
               else (v_row ->> 'id')::uuid end;
  v_project := case when tg_table_name = 'projects' then (v_row ->> 'id')::uuid
                    when tg_table_name = 'task_comments' then (select t.project_id from public.tasks t where t.id = (v_row ->> 'task_id')::uuid)
                    when v_row ? 'project_id' then (v_row ->> 'project_id')::uuid end;
  insert into public.audit_events (entity, entity_id, action, diff, project_id)
  values (tg_table_name, v_id, case when tg_table_name = 'payments' then 'payment_' || v_action else v_action end, v_diff, v_project);
  return coalesce(new, old);
end $$;

-- Scrub what is already there (tokens, and the pay rates from before 0014).
update public.audit_events set diff = diff - 'ics_token' - 'cost_rate' - 'bill_rate'
 where entity = 'members' and (diff ? 'ics_token' or diff ? 'cost_rate' or diff ? 'bill_rate');

-- The old tokens were readable, so everyone gets a new calendar link.
update public.members set ics_token = encode(extensions.gen_random_bytes(16), 'hex');

drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using (public.is_admin()
         or (public.is_member() and entity in ('projects', 'tasks', 'task_comments', 'files', 'deliverables', 'events', 'leads', 'clients', 'agreements'))
         or (project_id is not null and entity in ('tasks', 'task_comments', 'files', 'deliverables') and public.on_project(project_id)));
drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert to authenticated
  with check (public.is_team() and actor_email = public.my_email() and actor_id is not distinct from auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Invoices and payments: admin only. Members create, send and track quotes.
-- ---------------------------------------------------------------------------
drop policy if exists documents_read on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists documents_delete on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (public.is_admin() or (public.is_member() and doc_type = 'quote'));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_admin() or (public.can_edit() and doc_type = 'quote'));
create policy documents_update on public.documents for update to authenticated
  using (public.is_admin() or (public.can_edit() and doc_type = 'quote'))
  with check (public.is_admin() or (public.can_edit() and doc_type = 'quote'));
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_admin() or (public.can_edit() and doc_type = 'quote'));

-- Line items follow their document (the subquery runs under the documents policy).
drop policy if exists document_items_read on public.document_items;
drop policy if exists document_items_insert on public.document_items;
drop policy if exists document_items_update on public.document_items;
drop policy if exists document_items_delete on public.document_items;
create policy document_items_read on public.document_items for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));
create policy document_items_write on public.document_items for all to authenticated
  using (public.can_edit() and exists (select 1 from public.documents d where d.id = document_id))
  with check (public.can_edit() and exists (select 1 from public.documents d where d.id = document_id));

drop policy if exists payments_read on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;
create policy payments_admin on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists email_log_read on public.email_log;
create policy email_log_read on public.email_log for select to authenticated
  using (public.is_admin() or (public.is_member() and document_id is not null and exists (select 1 from public.documents d where d.id = document_id)));

drop policy if exists doc_counters_read on public.doc_counters;
drop policy if exists doc_counters_insert on public.doc_counters;
drop policy if exists doc_counters_update on public.doc_counters;
drop policy if exists doc_counters_delete on public.doc_counters;
create policy doc_counters_admin on public.doc_counters for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.next_doc_number(p_type public.doc_type, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_fy text := public.fy_of(p_date); v_seq int; v_prefix text;
begin
  if not (public.is_admin() or (public.can_edit() and p_type = 'quote')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.doc_counters (doc_type, fy) values (p_type, v_fy) on conflict do nothing;
  update public.doc_counters set next_seq = next_seq + 1
   where doc_type = p_type and fy = v_fy returning next_seq - 1 into v_seq;
  select coalesce(prefixes ->> p_type::text, 'KK') into v_prefix from public.settings where id = 1;
  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 3, '0');
end $$;

-- Approval (Settings → require approval) is enforced here too, not only in the app.
create or replace function public.guard_document_status() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'new documents start as drafts' using errcode = '42501'; end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if old.status = 'awaiting_approval' and new.status <> 'awaiting_approval' then
      raise exception 'waiting for the admin to approve' using errcode = '42501';
    end if;
    if new.status = 'issued' and coalesce((select require_approval from public.settings where id = 1), false) then
      raise exception 'this needs the admin''s approval first' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_document_status on public.documents;
create trigger guard_document_status before insert or update on public.documents
  for each row execute function public.guard_document_status();

-- ---------------------------------------------------------------------------
-- 3. Bank accounts: admin only. Quotes print the default account through this function.
-- ---------------------------------------------------------------------------
drop policy if exists bank_accounts_read on public.bank_accounts;
create policy bank_accounts_read on public.bank_accounts for select to authenticated using (public.is_admin());

create or replace function public.document_bank()
returns table (id uuid, label text, account_name text, account_no text, ifsc text, bank_name text,
               branch_address text, swift text, iban text, upi_id text, is_default boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.label, b.account_name, b.account_no, b.ifsc, b.bank_name, b.branch_address, b.swift, b.iban, b.upi_id, b.is_default
    from public.bank_accounts b
   where public.is_member() and b.kind <> 'cash'
   order by b.is_default desc, b.created_at
   limit 1;
$$;
revoke execute on function public.document_bank() from public, anon;
grant execute on function public.document_bank() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Project money (fee, retainer amount): admin only. Hours live on projects and stay visible.
-- ---------------------------------------------------------------------------
drop policy if exists project_finance_read on public.project_finance;
drop policy if exists project_finance_write on public.project_finance;
create policy project_finance_read on public.project_finance for select to authenticated using (public.is_admin());
-- members creating a project add its row (amounts are zeroed below); only the admin changes it
create policy project_finance_insert on public.project_finance for insert to authenticated with check (public.can_edit());
create policy project_finance_admin on public.project_finance for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy project_finance_delete on public.project_finance for delete to authenticated using (public.is_admin());

create or replace function public.guard_project_finance() returns trigger
language plpgsql as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.budget := 0; new.retainer_amount_month := 0;
  end if;
  return new;
end $$;
drop trigger if exists guard_project_finance on public.project_finance;
create trigger guard_project_finance before insert on public.project_finance
  for each row execute function public.guard_project_finance();

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Expenses: members see project costs (pass-through categories) and their own claims.
--    Overheads (salaries, rent, software), vendors, payments and TDS are admin only.
-- ---------------------------------------------------------------------------
create or replace function public.member_sees_expense(p_kind text, p_project uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and p_kind <> 'claim' and p_project is not null
     and exists (select 1 from public.expense_categories c where c.id = p_category and c.kind = 'pass_through');
$$;

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (public.is_admin()
         or (kind = 'claim' and created_by = public.my_email())
         or public.member_sees_expense(kind, project_id, category_id));
-- the admin records spend; everyone else (not viewers) files their own claims for approval
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    public.is_admin()
    or (kind = 'claim' and created_by = public.my_email() and paid_by_email = public.my_email()
        and approval = 'submitted' and public.my_role() in ('member', 'freelancer')
        and (project_id is null or public.on_project(project_id)))
  );
drop policy if exists expenses_update_staff on public.expenses;
create policy expenses_update_staff on public.expenses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.is_admin() or (kind = 'claim' and created_by = public.my_email() and approval in ('submitted', 'rejected')));

drop policy if exists expense_payments_read on public.expense_payments;
create policy expense_payments_read on public.expense_payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.expenses e where e.id = expense_id and e.kind = 'claim' and e.created_by = public.my_email()));

drop policy if exists vendors_read on public.vendors;
drop policy if exists vendors_write on public.vendors;
create policy vendors_admin on public.vendors for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists tds_challans_read on public.tds_challans;
create policy tds_challans_read on public.tds_challans for select to authenticated using (public.is_admin());

-- Keep the vendor's name on the expense so people who can't read vendors still see who it was.
create or replace function public.fill_vendor_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null then
    select v.name into new.vendor_name from public.vendors v where v.id = new.vendor_id;
    new.vendor_name := coalesce(new.vendor_name, '');
  end if;
  return new;
end $$;
drop trigger if exists fill_vendor_name on public.expenses;
create trigger fill_vendor_name before insert or update of vendor_id on public.expenses
  for each row execute function public.fill_vendor_name();
alter table public.expenses disable trigger expenses_guard;
update public.expenses e set vendor_name = v.name from public.vendors v where v.id = e.vendor_id and e.vendor_name is distinct from v.name;
alter table public.expenses enable trigger expenses_guard;

-- Receipts: the same people who can see the expense.
create or replace function public.can_read_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.on_project(parts[2]::uuid); end if;
  if parts[1] = 'expenses' and parts[2] ~ '^[0-9a-f-]{36}$' then
    return public.is_admin() or exists (
      select 1 from public.expenses e where e.id = parts[2]::uuid
         and ((e.kind = 'claim' and e.created_by = public.my_email()) or public.member_sees_expense(e.kind, e.project_id, e.category_id)));
  end if;
  return public.is_member();
end $$;

create or replace function public.can_write_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.can_work(parts[2]::uuid); end if;
  if parts[1] = 'expenses' and parts[2] ~ '^[0-9a-f-]{36}$' then
    return public.is_admin() or exists (
      select 1 from public.expenses e where e.id = parts[2]::uuid and e.kind = 'claim'
         and e.created_by = public.my_email() and e.approval in ('submitted', 'rejected'));
  end if;
  return public.is_admin();
end $$;

-- Deleting: project files by editors on that project (or their uploader); anything else
-- (signed agreements, receipts) only by the admin or the person who uploaded it.
create or replace function public.can_delete_file_path(p_name text, p_owner text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if public.is_admin() or (p_owner is not null and p_owner = auth.uid()::text) then return true; end if;
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.can_edit() and public.on_project(parts[2]::uuid); end if;
  return false;
end $$;
drop policy if exists studio_files_delete on storage.objects;
create policy studio_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.can_delete_file_path(name, owner_id));

-- Stored document PDFs: admin only (the app saves them with the service role). Brand assets
-- (the signature) stay readable for printing but only the admin changes them.
drop policy if exists team_files_read on storage.objects;
drop policy if exists team_files_insert on storage.objects;
drop policy if exists team_files_update on storage.objects;
drop policy if exists team_files_delete on storage.objects;
create policy team_files_read on storage.objects for select to authenticated
  using ((bucket_id = 'brand' and public.is_member()) or (bucket_id = 'invoices' and public.is_admin()));
create policy team_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('invoices', 'brand') and public.is_admin());
create policy team_files_update on storage.objects for update to authenticated
  using (bucket_id in ('invoices', 'brand') and public.is_admin());
create policy team_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('invoices', 'brand') and public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Time: everyone sees their own hours; projects show totals, not who logged what.
-- ---------------------------------------------------------------------------
drop policy if exists time_read on public.time_entries;
create policy time_read on public.time_entries for select to authenticated
  using (member_email = public.my_email() or public.is_admin());
drop policy if exists time_insert on public.time_entries;
create policy time_insert on public.time_entries for insert to authenticated
  with check (member_email = public.my_email() and public.my_role() <> 'viewer' and public.on_project(project_id)
              and (status = 'draft' or public.is_admin()));

-- Logged minutes on a project by task and month (no names), for anyone on the project.
create or replace function public.project_minutes(p_project uuid)
returns table (task_id uuid, month date, minutes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.on_project(p_project) then return; end if;
  return query
    select t.task_id, date_trunc('month', t.work_date)::date, sum(t.minutes)::bigint
      from public.time_entries t
     where t.project_id = p_project and t.timer_started_at is null and t.status <> 'rejected'
     group by t.task_id, date_trunc('month', t.work_date);
end $$;
revoke execute on function public.project_minutes(uuid) from public, anon;
grant execute on function public.project_minutes(uuid) to authenticated;

-- Hours booked per person (for the workload page), without the entries behind them.
create or replace function public.team_logged_minutes(p_from date, p_to date)
returns table (member_email text, minutes bigint)
language sql stable security definer set search_path = public as $$
  select t.member_email, sum(t.minutes)::bigint
    from public.time_entries t
   where public.is_member() and t.work_date between p_from and p_to
     and t.timer_started_at is null and t.status <> 'rejected'
   group by t.member_email;
$$;
revoke execute on function public.team_logged_minutes(date, date) from public, anon;
grant execute on function public.team_logged_minutes(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Leave: the type and note are private to the person and the admin. Others see "away".
-- ---------------------------------------------------------------------------
drop policy if exists leave_read on public.leave_requests;
create policy leave_read on public.leave_requests for select to authenticated
  using (member_email = public.my_email() or public.is_admin());

create or replace function public.team_away(p_from date default null)
returns table (id uuid, member_email text, from_date date, to_date date, half_day boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.member_email, l.from_date, l.to_date, l.half_day
    from public.leave_requests l
   where public.is_member() and l.status = 'approved' and (p_from is null or l.to_date >= p_from)
   order by l.from_date;
$$;
revoke execute on function public.team_away(date) from public, anon;
grant execute on function public.team_away(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Leads: only the admin deletes.
-- ---------------------------------------------------------------------------
drop policy if exists leads_write on public.leads;
create policy leads_insert on public.leads for insert to authenticated with check (public.can_edit());
create policy leads_update on public.leads for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy leads_delete on public.leads for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Signing evidence (IP address, device) is in the signed certificate, not the staff screens.
-- ---------------------------------------------------------------------------
revoke select on public.agreement_signers from anon, authenticated;
grant select (id, agreement_id, position, party, name, email, verified_at, viewed_at, signed_at, signature_name,
              declined_at, decline_reason, reminded_at, reminder_count, created_at) on public.agreement_signers to authenticated;
revoke select on public.agreement_events from anon, authenticated;
grant select (id, agreement_id, at, action, actor, signer_id, detail, prev_hash, hash) on public.agreement_events to authenticated;
