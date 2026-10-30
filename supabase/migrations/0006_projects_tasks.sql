-- Studio OS phase 0 + 1: freelancer access, projects with templates, phases, tasks, comments,
-- files, deliverables, notifications. Money stays visible to staff only.

-- ---------------------------------------------------------------------------
-- Roles: "member" in SQL helpers means staff (admin, member, viewer). Freelancers are on the
-- team but only see the projects they're added to.
-- ---------------------------------------------------------------------------
create or replace function public.is_member() returns boolean
language sql stable as $$ select public.my_role() in ('admin', 'member', 'viewer') $$;

create or replace function public.is_team() returns boolean
language sql stable as $$ select public.my_role() is not null $$;

create or replace function public.is_freelancer() returns boolean
language sql stable as $$ select public.my_role() = 'freelancer' $$;

-- Names and roles of everyone on the team (no rates), for assignee pickers and mentions.
create or replace function public.team_directory()
returns table (email text, name text, role public.app_role, joined boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'team only' using errcode = '42501'; end if;
  return query select m.email, m.name, m.role, m.joined_at is not null
                 from public.members m order by m.name = '', m.name, m.email;
end $$;
revoke execute on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- Projects: extended; money moves to project_finance (staff only)
-- ---------------------------------------------------------------------------
create sequence if not exists public.project_code_seq;
grant usage on sequence public.project_code_seq to authenticated;

create table public.project_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  type         text not null default '',
  description  text not null default '',
  billing      text not null default 'fixed' check (billing in ('fixed', 'hourly', 'retainer')),
  budget_hours numeric(8,2) not null default 0,
  data         jsonb not null default '{"phases":[],"tasks":[],"deliverables":[]}',
  created_at   timestamptz not null default now()
);

alter table public.projects drop constraint if exists projects_status_check;
update public.projects set status = 'done' where status = 'closed';
alter table public.projects
  alter column client_id drop not null,
  add column code                 text unique,
  add column type                 text not null default '',
  add column description          text not null default '',
  add column start_date           date,
  add column due_date             date,
  add column owner_email          text references public.members(email) on update cascade on delete set null,
  add column budget_hours         numeric(8,2) not null default 0,
  add column retainer_hours_month numeric(8,2) not null default 0,
  add column template_id          uuid references public.project_templates(id) on delete set null,
  add column colour               text not null default '',
  add column updated_at           timestamptz not null default now(),
  add constraint projects_status_check check (status in ('planned', 'active', 'on_hold', 'review', 'done', 'cancelled'));
update public.projects set code = 'KK-' || lpad(nextval('public.project_code_seq')::text, 4, '0') where code is null;
alter table public.projects alter column code set default 'KK-' || lpad(nextval('public.project_code_seq')::text, 4, '0');
alter table public.projects alter column code set not null;

create table public.project_finance (
  project_id             uuid primary key references public.projects(id) on delete cascade,
  budget                 numeric(14,2) not null default 0,
  billing                text not null default 'fixed' check (billing in ('fixed', 'hourly', 'retainer')),
  hourly_rate            numeric(10,2) not null default 0,
  retainer_amount_month  numeric(14,2) not null default 0,
  updated_at             timestamptz not null default now()
);
insert into public.project_finance (project_id, budget) select id, budget from public.projects;
alter table public.projects drop column budget;

create table public.project_members (
  project_id      uuid not null references public.projects(id) on delete cascade,
  member_email    text not null references public.members(email) on update cascade on delete cascade,
  role_on_project text not null default '',
  added_at        timestamptz not null default now(),
  primary key (project_id, member_email)
);
create index project_members_email_idx on public.project_members (member_email);

-- True for staff, or for anyone added to the project. Security definer so policies on
-- project_members can call it without recursing.
create or replace function public.on_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member()
      or (public.is_team() and exists (
            select 1 from public.project_members pm
             where pm.project_id = p_project and pm.member_email = public.my_email()))
$$;

-- Editors, or freelancers on that project, can change its tasks.
create or replace function public.can_work(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit() or (public.is_freelancer() and public.on_project(p_project))
$$;

create table public.phases (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  sort       int not null default 0,
  due_date   date
);
create index phases_project_idx on public.phases (project_id, sort);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  phase_id       uuid references public.phases(id) on delete set null,
  parent_id      uuid references public.tasks(id) on delete cascade,
  title          text not null check (length(trim(title)) > 0),
  description    text not null default '',
  status         text not null default 'todo' check (status in ('todo', 'doing', 'review', 'client_review', 'done')),
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  start_date     date,
  due_date       date,
  estimate_hours numeric(6,2) not null default 0 check (estimate_hours >= 0),
  labels         text[] not null default '{}',
  sort           double precision not null default 0,
  client_visible boolean not null default false,
  completed_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id, status, sort);
create index tasks_parent_idx on public.tasks (parent_id);
create index tasks_due_idx on public.tasks (due_date) where status <> 'done';

create or replace function public.task_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at = now(); end if;
  if new.status <> 'done' then new.completed_at = null; end if;
  return new;
end $$;
create trigger tasks_completed before insert or update of status on public.tasks
  for each row execute function public.task_completed_at();

create table public.task_assignees (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  member_email text not null references public.members(email) on update cascade on delete cascade,
  primary key (task_id, member_email)
);
create index task_assignees_email_idx on public.task_assignees (member_email);

create table public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  author_email text not null default public.my_email(),
  body         text not null check (length(trim(body)) > 0),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.deliverables (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  qty            int not null default 1 check (qty > 0),
  revision_limit int not null default 2 check (revision_limit >= 0),
  status         text not null default 'pending' check (status in ('pending', 'in_progress', 'delivered')),
  due_date       date,
  sort           int not null default 0
);
create index deliverables_project_idx on public.deliverables (project_id, sort);

-- One table for every attachment: uploads (Supabase Storage, bucket "files") or links (Drive etc.).
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete cascade,
  client_id    uuid references public.clients(id) on delete cascade,
  kind         text not null check (kind in ('upload', 'link')),
  storage_path text,
  url          text,
  name         text not null check (length(trim(name)) > 0),
  size         bigint not null default 0,
  mime         text not null default '',
  version_of   uuid references public.files(id) on delete set null,
  uploaded_by  text not null default public.my_email(),
  created_at   timestamptz not null default now(),
  check ((kind = 'upload' and storage_path is not null) or (kind = 'link' and url ~ '^https?://'))
);
create index files_project_idx on public.files (project_id, created_at desc);
create index files_task_idx on public.files (task_id);

create table public.notifications (
  id              bigint generated always as identity primary key,
  recipient_email text not null,
  actor_email     text not null default public.my_email(),
  kind            text not null,
  title           text not null,
  body            text not null default '',
  link            text not null default '',
  read_at         timestamptz,
  emailed_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_email, created_at desc);

-- updated_at
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger project_finance_touch before update on public.project_finance for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit: record project_id so a project's activity feed can be built; ignore sort-only changes.
-- ---------------------------------------------------------------------------
alter table public.audit_events add column project_id uuid;
create index audit_events_project_idx on public.audit_events (project_id, at desc) where project_id is not null;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_diff jsonb := '{}'; k text; o jsonb; n jsonb; v_action text := lower(tg_op); v_id uuid; v_project uuid;
        v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'view_count', 'last_viewed_at', 'first_viewed_at', 'sort', 'completed_at')
         and (o -> k) is distinct from (n -> k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if v_diff = '{}' then return new; end if;
    if tg_table_name in ('documents', 'tasks', 'projects') and (o ->> 'status') is distinct from (n ->> 'status') then
      v_action := 'status_' || (n ->> 'status');
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := to_jsonb(new);
  else
    v_diff := to_jsonb(old);
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

create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.audit_row();
create trigger audit_project_finance after update on public.project_finance
  for each row execute function public.audit_row();
create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function public.audit_row();
create trigger audit_task_comments after insert or delete on public.task_comments
  for each row execute function public.audit_row();
create trigger audit_files after insert or delete on public.files
  for each row execute function public.audit_row();
create trigger audit_deliverables after insert or update or delete on public.deliverables
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- projects: staff read all, freelancers read their own; editors write.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using (public.on_project(id));

alter table public.project_finance enable row level security;
create policy project_finance_read on public.project_finance for select to authenticated using (public.is_member());
create policy project_finance_write on public.project_finance for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

alter table public.project_templates enable row level security;
create policy project_templates_read on public.project_templates for select to authenticated using (public.is_team());
create policy project_templates_write on public.project_templates for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

alter table public.project_members enable row level security;
create policy project_members_read on public.project_members for select to authenticated using (public.on_project(project_id));
create policy project_members_write on public.project_members for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

do $$
declare t text;
begin
  -- Plan structure: everyone on the project reads, editors write.
  foreach t in array array['phases', 'deliverables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.on_project(project_id))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_edit()) with check (public.can_edit())', t || '_write', t);
  end loop;
end $$;

alter table public.tasks enable row level security;
create policy tasks_read on public.tasks for select to authenticated using (public.on_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_work(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_work(project_id)) with check (public.can_work(project_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_edit() or (public.can_work(project_id) and created_by = auth.uid()));

create or replace function public.task_project(p_task uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = p_task
$$;

alter table public.task_assignees enable row level security;
create policy task_assignees_read on public.task_assignees for select to authenticated
  using (public.on_project(public.task_project(task_id)));
create policy task_assignees_write on public.task_assignees for all to authenticated
  using (public.can_work(public.task_project(task_id))) with check (public.can_work(public.task_project(task_id)));

alter table public.task_comments enable row level security;
create policy task_comments_read on public.task_comments for select to authenticated
  using (public.on_project(public.task_project(task_id)));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_email = public.my_email() and public.my_role() <> 'viewer' and public.on_project(public.task_project(task_id)));
create policy task_comments_update on public.task_comments for update to authenticated
  using (author_email = public.my_email()) with check (author_email = public.my_email());
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_email = public.my_email() or public.is_admin());

alter table public.files enable row level security;
create policy files_read on public.files for select to authenticated
  using (case when project_id is not null then public.on_project(project_id) else public.is_member() end);
create policy files_insert on public.files for insert to authenticated
  with check (uploaded_by = public.my_email()
              and case when project_id is not null then public.can_work(project_id) else public.can_edit() end);
create policy files_delete on public.files for delete to authenticated
  using (public.can_edit() or uploaded_by = public.my_email());

alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using (recipient_email = public.my_email());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_team() and actor_email = public.my_email());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_email = public.my_email()) with check (recipient_email = public.my_email());

-- Audit: freelancers also see activity on their projects' work items.
drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using (public.is_member()
         or (project_id is not null and entity in ('tasks', 'task_comments', 'files', 'deliverables')
             and public.on_project(project_id)));
drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert to authenticated with check (public.is_team());

-- Client names for project cards: freelancers can't read clients, so expose just the name.
create or replace function public.project_client_names(p_ids uuid[])
returns table (project_id uuid, client_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(c.name, '') from public.projects p left join public.clients c on c.id = p.client_id
   where p.id = any(p_ids) and public.on_project(p.id)
$$;
revoke execute on function public.project_client_names(uuid[]) from public, anon;
grant execute on function public.project_client_names(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Apply a template to a project: phases, tasks (dated from p_start) and deliverables.
-- Runs with the caller's rights, so RLS still decides.
-- ---------------------------------------------------------------------------
create or replace function public.apply_project_template(p_project uuid, p_template uuid, p_start date)
returns int language plpgsql set search_path = public as $$
declare tpl jsonb; ph jsonb; t jsonb; d jsonb; i int := 0; v_phase uuid; n int := 0; v_task uuid;
begin
  if not public.can_edit() then raise exception 'editors only' using errcode = '42501'; end if;
  select data into tpl from public.project_templates where id = p_template;
  if tpl is null then raise exception 'template not found'; end if;
  for ph in select * from jsonb_array_elements(coalesce(tpl -> 'phases', '[]')) loop
    insert into public.phases (project_id, name, sort) values (p_project, ph #>> '{}', i);
    i := i + 1;
  end loop;
  i := 0;
  for t in select * from jsonb_array_elements(coalesce(tpl -> 'tasks', '[]')) loop
    select id into v_phase from public.phases where project_id = p_project and name = t ->> 'phase' limit 1;
    insert into public.tasks (project_id, phase_id, title, estimate_hours, due_date, client_visible, sort)
    values (p_project, v_phase, t ->> 'title', coalesce((t ->> 'hours')::numeric, 0),
            p_start + coalesce((t ->> 'day')::int, 0), coalesce((t ->> 'client')::boolean, false), i)
    returning id into v_task;
    i := i + 1; n := n + 1;
  end loop;
  i := 0;
  for d in select * from jsonb_array_elements(coalesce(tpl -> 'deliverables', '[]')) loop
    insert into public.deliverables (project_id, name, qty, revision_limit, sort)
    values (p_project, d ->> 'name', coalesce((d ->> 'qty')::int, 1), coalesce((d ->> 'revisions')::int, 2), i);
    i := i + 1;
  end loop;
  -- phase due dates = their latest task
  update public.phases ph set due_date = (select max(due_date) from public.tasks where phase_id = ph.id)
   where ph.project_id = p_project;
  return n;
end $$;
revoke execute on function public.apply_project_template(uuid, uuid, date) from public, anon;
grant execute on function public.apply_project_template(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket "files", paths projects/<project_id>/<file> or clients/<client_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800) on conflict (id) do nothing;

create or replace function public.can_read_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.on_project(parts[2]::uuid); end if;
  return public.is_member();
end $$;

create or replace function public.can_write_file_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name);
begin
  if parts[1] = 'projects' and parts[2] ~ '^[0-9a-f-]{36}$' then return public.can_work(parts[2]::uuid); end if;
  return public.can_edit();
end $$;

create policy studio_files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.can_read_file_path(name));
create policy studio_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.can_write_file_path(name));
create policy studio_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (public.can_edit() or owner_id = auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Studio templates (editable later). day = due offset from the project start.
-- ---------------------------------------------------------------------------
insert into public.project_templates (name, type, description, billing, budget_hours, data) values
('Brand identity', 'branding', 'Discovery to final brand guidelines, 3 logo routes, 2 refinement rounds.', 'fixed', 80, '{
  "phases": ["Discovery", "Strategy", "Concepts", "Refinement", "Delivery"],
  "tasks": [
    {"phase": "Discovery", "title": "Kickoff call", "hours": 2, "day": 0, "client": true},
    {"phase": "Discovery", "title": "Review brand questionnaire", "hours": 2, "day": 1},
    {"phase": "Discovery", "title": "Competitor audit and moodboard", "hours": 6, "day": 3},
    {"phase": "Strategy", "title": "Brand strategy document", "hours": 6, "day": 5, "client": true},
    {"phase": "Concepts", "title": "Logo concepts (3 routes)", "hours": 16, "day": 10},
    {"phase": "Concepts", "title": "Concept presentation", "hours": 3, "day": 12, "client": true},
    {"phase": "Refinement", "title": "Refine chosen route, round 1", "hours": 8, "day": 16},
    {"phase": "Refinement", "title": "Refine chosen route, round 2", "hours": 6, "day": 19},
    {"phase": "Refinement", "title": "Colour and type system", "hours": 6, "day": 21},
    {"phase": "Delivery", "title": "Brand guidelines document", "hours": 12, "day": 26},
    {"phase": "Delivery", "title": "Export final files (AI, SVG, PNG, PDF)", "hours": 4, "day": 28},
    {"phase": "Delivery", "title": "Handover", "hours": 1, "day": 29, "client": true}
  ],
  "deliverables": [
    {"name": "Logo suite", "qty": 1, "revisions": 2},
    {"name": "Brand guidelines", "qty": 1, "revisions": 2},
    {"name": "Stationery set", "qty": 1, "revisions": 2}
  ]}'),
('Product shoot', 'photography', 'Studio product shoot: shot list, one shoot day, selects, retouching.', 'fixed', 30, '{
  "phases": ["Pre-production", "Shoot", "Post-production", "Delivery"],
  "tasks": [
    {"phase": "Pre-production", "title": "Shot list and references", "hours": 3, "day": 0, "client": true},
    {"phase": "Pre-production", "title": "Props and styling", "hours": 4, "day": 2},
    {"phase": "Pre-production", "title": "Book crew and kit", "hours": 1, "day": 2},
    {"phase": "Pre-production", "title": "Call sheet", "hours": 1, "day": 4},
    {"phase": "Shoot", "title": "Shoot day", "hours": 8, "day": 5},
    {"phase": "Post-production", "title": "Culling and selects", "hours": 3, "day": 6},
    {"phase": "Post-production", "title": "Client picks selects", "hours": 1, "day": 7, "client": true},
    {"phase": "Post-production", "title": "Retouching", "hours": 8, "day": 10},
    {"phase": "Delivery", "title": "Export and deliver finals", "hours": 2, "day": 12, "client": true}
  ],
  "deliverables": [{"name": "Edited images", "qty": 20, "revisions": 1}]}'),
('Campaign shoot', 'photography', 'Concept, casting, location, shoot days, retouching and resizes.', 'fixed', 60, '{
  "phases": ["Concept", "Pre-production", "Shoot", "Post-production", "Delivery"],
  "tasks": [
    {"phase": "Concept", "title": "Creative concept and moodboard", "hours": 8, "day": 0, "client": true},
    {"phase": "Pre-production", "title": "Location recce", "hours": 4, "day": 4},
    {"phase": "Pre-production", "title": "Casting and model releases", "hours": 4, "day": 5},
    {"phase": "Pre-production", "title": "Wardrobe and styling", "hours": 6, "day": 6},
    {"phase": "Pre-production", "title": "Crew, kit and permits", "hours": 2, "day": 6},
    {"phase": "Pre-production", "title": "Call sheet", "hours": 2, "day": 8},
    {"phase": "Shoot", "title": "Shoot days", "hours": 16, "day": 10},
    {"phase": "Post-production", "title": "Selects review with client", "hours": 4, "day": 12, "client": true},
    {"phase": "Post-production", "title": "Retouching", "hours": 10, "day": 17},
    {"phase": "Post-production", "title": "Adaptations and resizes", "hours": 4, "day": 19},
    {"phase": "Delivery", "title": "Deliver finals", "hours": 2, "day": 20, "client": true}
  ],
  "deliverables": [
    {"name": "Hero images", "qty": 10, "revisions": 2},
    {"name": "Social cut-downs", "qty": 15, "revisions": 1}
  ]}'),
('Social media retainer (monthly)', 'retainer', 'One month of content: calendar, shoot, designs, captions, scheduling, report.', 'retainer', 40, '{
  "phases": ["Planning", "Production", "Publishing", "Reporting"],
  "tasks": [
    {"phase": "Planning", "title": "Monthly content calendar", "hours": 4, "day": 0, "client": true},
    {"phase": "Planning", "title": "Calendar approval", "hours": 0.5, "day": 3, "client": true},
    {"phase": "Production", "title": "Shoot and asset creation", "hours": 12, "day": 7},
    {"phase": "Production", "title": "Post designs", "hours": 12, "day": 12},
    {"phase": "Production", "title": "Captions and copy", "hours": 4, "day": 12},
    {"phase": "Production", "title": "Client approval round", "hours": 1, "day": 14, "client": true},
    {"phase": "Publishing", "title": "Schedule posts", "hours": 2, "day": 16},
    {"phase": "Publishing", "title": "Community check-ins", "hours": 3, "day": 20},
    {"phase": "Reporting", "title": "Monthly report", "hours": 2, "day": 29, "client": true}
  ],
  "deliverables": [
    {"name": "Posts", "qty": 12, "revisions": 2},
    {"name": "Reels", "qty": 4, "revisions": 1}
  ]}'),
('Packaging', 'packaging', 'Two concept routes to print-ready artwork and press check.', 'fixed', 70, '{
  "phases": ["Brief", "Concepts", "Development", "Prepress", "Print"],
  "tasks": [
    {"phase": "Brief", "title": "Brief and dielines from client", "hours": 2, "day": 0, "client": true},
    {"phase": "Brief", "title": "Shelf and category research", "hours": 4, "day": 2},
    {"phase": "Concepts", "title": "Concepts (2 routes)", "hours": 14, "day": 7},
    {"phase": "Concepts", "title": "Concept presentation", "hours": 2, "day": 9, "client": true},
    {"phase": "Development", "title": "Development, round 1", "hours": 10, "day": 14},
    {"phase": "Development", "title": "Mockups and 3D renders", "hours": 6, "day": 17},
    {"phase": "Prepress", "title": "Final artwork per SKU", "hours": 12, "day": 21},
    {"phase": "Prepress", "title": "Prepress checks and print-ready files", "hours": 4, "day": 23},
    {"phase": "Print", "title": "Printer proof approval", "hours": 1, "day": 26, "client": true},
    {"phase": "Print", "title": "Press check", "hours": 3, "day": 28}
  ],
  "deliverables": [{"name": "Packaging artwork (per SKU)", "qty": 3, "revisions": 2}]}'),
('Website', 'web', 'Sitemap, wireframes, UI design, build, launch and handover.', 'fixed', 100, '{
  "phases": ["Discovery", "Wireframes", "Design", "Build", "Launch"],
  "tasks": [
    {"phase": "Discovery", "title": "Kickoff and content needs", "hours": 2, "day": 0, "client": true},
    {"phase": "Discovery", "title": "Sitemap", "hours": 3, "day": 3, "client": true},
    {"phase": "Wireframes", "title": "Wireframes", "hours": 10, "day": 8},
    {"phase": "Wireframes", "title": "Wireframe review", "hours": 1, "day": 10, "client": true},
    {"phase": "Design", "title": "UI design, key pages", "hours": 20, "day": 18},
    {"phase": "Design", "title": "Design review", "hours": 1, "day": 20, "client": true},
    {"phase": "Build", "title": "Build", "hours": 40, "day": 34},
    {"phase": "Build", "title": "Content upload", "hours": 6, "day": 37},
    {"phase": "Build", "title": "QA and browser testing", "hours": 6, "day": 40},
    {"phase": "Launch", "title": "Launch", "hours": 2, "day": 42, "client": true},
    {"phase": "Launch", "title": "Training and handover", "hours": 2, "day": 43, "client": true}
  ],
  "deliverables": [
    {"name": "Page designs", "qty": 6, "revisions": 2},
    {"name": "Live website", "qty": 1, "revisions": 1}
  ]}');
