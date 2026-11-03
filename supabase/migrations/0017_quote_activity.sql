-- Members see the activity on quotes (the subquery runs under the documents policy, so only
-- documents they can read count); invoice and payment history stays with the admin.
drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using (public.is_admin()
         or (public.is_member() and entity in ('projects', 'tasks', 'task_comments', 'files', 'deliverables', 'events', 'leads', 'clients', 'agreements'))
         or (public.is_member() and entity = 'documents' and exists (select 1 from public.documents d where d.id = entity_id))
         or (project_id is not null and entity in ('tasks', 'task_comments', 'files', 'deliverables') and public.on_project(project_id)));
