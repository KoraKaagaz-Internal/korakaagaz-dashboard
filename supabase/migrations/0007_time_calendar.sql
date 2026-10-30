-- Studio OS phase 2: time tracking + approvals, rates and capacity, calendar (shoots, crew, kit),
-- leave and holidays, private calendar feeds.

-- ---------------------------------------------------------------------------
-- People: rates (admin only), capacity, calendar feed token
-- ---------------------------------------------------------------------------
alter table public.members
  add column cost_rate             numeric(10,2) not null default 0 check (cost_rate >= 0),
  add column bill_rate             numeric(10,2) not null default 0 check (bill_rate >= 0),
  add column weekly_capacity_hours numeric(5,2)  not null default 40 check (weekly_capacity_hours between 0 and 80),
  add column ics_token             text unique default encode(extensions.gen_random_bytes(16), 'hex');
update public.members set ics_token = encode(extensions.gen_random_bytes(16), 'hex') where ics_token is null;

-- Rates are salaries in disguise: admin only.
create or replace function public.admin_member_rates()
returns table (email text, name text, role public.app_role, cost_rate numeric, bill_rate numeric, weekly_capacity_hours numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select m.email, m.name, m.role, m.cost_rate, m.bill_rate, m.weekly_capacity_hours
                 from public.members m order by m.name = '', m.name, m.email;
end $$;

create or replace function public.admin_set_rates(p_email text, p_cost numeric, p_bill numeric, p_capacity numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.members set cost_rate = p_cost, bill_rate = p_bill, weekly_capacity_hours = p_capacity where email = lower(p_email);
end $$;

-- Capacity (no money) for the workload view: staff only.
create or replace function public.team_capacity()
returns table (email text, weekly_capacity_hours numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'staff only' using errcode = '42501'; end if;
  return query select m.email, m.weekly_capacity_hours from public.members m;
end $$;

create or replace function public.my_ics_token(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_team() then raise exception 'team only' using errcode = '42501'; end if;
  if p_rotate then
    update public.members set ics_token = encode(extensions.gen_random_bytes(16), 'hex') where email = public.my_email();
  end if;
  select ics_token into t from public.members where email = public.my_email();
  return t;
end $$;

revoke execute on function public.admin_member_rates(), public.admin_set_rates(text, numeric, numeric, numeric),
  public.team_capacity(), public.my_ics_token(boolean) from public, anon;
grant execute on function public.admin_member_rates(), public.admin_set_rates(text, numeric, numeric, numeric),
  public.team_capacity(), public.my_ics_token(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id                   uuid primary key default gen_random_uuid(),
  member_email         text not null default public.my_email() references public.members(email) on update cascade on delete cascade,
  project_id           uuid not null references public.projects(id) on delete cascade,
  task_id              uuid references public.tasks(id) on delete set null,
  work_date            date not null,
  minutes              int not null default 0 check (minutes between 0 and 1440),
  billable             boolean not null default true,
  note                 text not null default '',
  status               text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  timer_started_at     timestamptz,
  invoiced_document_id uuid references public.documents(id) on delete set null,
  decided_by           text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index time_entries_member_idx on public.time_entries (member_email, work_date);
create index time_entries_project_idx on public.time_entries (project_id, work_date);
-- one running timer per person
create unique index time_entries_one_timer on public.time_entries (member_email) where timer_started_at is not null;

create trigger time_entries_touch before update on public.time_entries for each row execute function public.touch_updated_at();

-- Approved/invoiced time is locked; record who decided.
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
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    new.decided_by = public.my_email(); new.decided_at = now();
  end if;
  return new;
end $$;
create trigger time_entries_guard before update or delete on public.time_entries
  for each row execute function public.guard_time_entry();

alter table public.time_entries enable row level security;
create policy time_read on public.time_entries for select to authenticated
  using (member_email = public.my_email() or public.is_member());
create policy time_insert on public.time_entries for insert to authenticated
  with check (member_email = public.my_email() and public.my_role() <> 'viewer' and public.on_project(project_id));
-- people edit their own time until it's submitted (or after it's sent back)
create policy time_update_own on public.time_entries for update to authenticated
  using (member_email = public.my_email() and status in ('draft', 'rejected'))
  with check (member_email = public.my_email() and status in ('draft', 'submitted') and public.on_project(project_id));
create policy time_update_admin on public.time_entries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy time_delete on public.time_entries for delete to authenticated
  using ((member_email = public.my_email() and status in ('draft', 'rejected')) or public.is_admin());

-- Approved time × cost rate per project (admin only: exposes rates indirectly).
create or replace function public.admin_project_costs(p_from date default null, p_to date default null)
returns table (project_id uuid, member_email text, minutes bigint, billable_minutes bigint, cost numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select t.project_id, t.member_email, sum(t.minutes)::bigint, sum(case when t.billable then t.minutes else 0 end)::bigint,
           round(sum(t.minutes) / 60.0 * max(m.cost_rate), 2)
      from public.time_entries t join public.members m on m.email = t.member_email
     where t.status = 'approved' and t.timer_started_at is null
       and (p_from is null or t.work_date >= p_from) and (p_to is null or t.work_date <= p_to)
     group by t.project_id, t.member_email;
end $$;
revoke execute on function public.admin_project_costs(date, date) from public, anon;
grant execute on function public.admin_project_costs(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar: events, crew, kit
-- ---------------------------------------------------------------------------
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'shoot' check (type in ('shoot', 'meeting', 'deadline', 'other')),
  title      text not null check (length(trim(title)) > 0),
  project_id uuid references public.projects(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  all_day    boolean not null default false,
  location   text not null default '',
  map_url    text not null default '' check (map_url = '' or map_url ~ '^https?://'),
  status     text not null default 'confirmed' check (status in ('tentative', 'confirmed', 'cancelled')),
  call_time  time,
  notes      text not null default '',
  shot_list  text not null default '',
  contacts   text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index events_time_idx on public.events (starts_at, ends_at);
create index events_project_idx on public.events (project_id);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create table public.event_people (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  member_email  text references public.members(email) on update cascade on delete cascade,
  external_name text not null default '',
  role          text not null default '',
  phone         text not null default '',
  check (member_email is not null or length(trim(external_name)) > 0),
  unique (event_id, member_email)
);
create index event_people_email_idx on public.event_people (member_email);

create table public.kit (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  category   text not null default '',
  serial     text not null default '',
  notes      text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.event_kit (
  event_id uuid not null references public.events(id) on delete cascade,
  kit_id   uuid not null references public.kit(id) on delete cascade,
  primary key (event_id, kit_id)
);
create index event_kit_kit_idx on public.event_kit (kit_id);

create or replace function public.on_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member()
      or exists (select 1 from public.events e where e.id = p_event and e.project_id is not null and public.on_project(e.project_id))
      or exists (select 1 from public.event_people ep where ep.event_id = p_event and ep.member_email = public.my_email())
$$;

alter table public.events enable row level security;
create policy events_read on public.events for select to authenticated using (public.on_event(id));
create policy events_write on public.events for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.event_people enable row level security;
create policy event_people_read on public.event_people for select to authenticated using (public.on_event(event_id));
create policy event_people_write on public.event_people for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.kit enable row level security;
create policy kit_read on public.kit for select to authenticated using (public.is_team());
create policy kit_write on public.kit for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.event_kit enable row level security;
create policy event_kit_read on public.event_kit for select to authenticated using (public.on_event(event_id));
create policy event_kit_write on public.event_kit for all to authenticated using (public.can_edit()) with check (public.can_edit());

-- ---------------------------------------------------------------------------
-- Leave and holidays
-- ---------------------------------------------------------------------------
create table public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  member_email text not null default public.my_email() references public.members(email) on update cascade on delete cascade,
  from_date    date not null,
  to_date      date not null,
  half_day     boolean not null default false,
  kind         text not null default 'casual' check (kind in ('casual', 'sick', 'unpaid', 'other')),
  note         text not null default '',
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by   text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  check (to_date >= from_date),
  check (not half_day or from_date = to_date)
);
create index leave_member_idx on public.leave_requests (member_email, from_date);

create or replace function public.decide_leave() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'declined') then
    new.decided_by = public.my_email(); new.decided_at = now();
  end if;
  return new;
end $$;
create trigger leave_decide before update on public.leave_requests for each row execute function public.decide_leave();

alter table public.leave_requests enable row level security;
create policy leave_read on public.leave_requests for select to authenticated
  using (member_email = public.my_email() or public.is_member());
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (member_email = public.my_email() and status = 'pending' and public.is_team());
create policy leave_admin on public.leave_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy leave_delete on public.leave_requests for delete to authenticated
  using ((member_email = public.my_email() and status = 'pending') or public.is_admin());

create table public.holidays (
  day  date primary key,
  name text not null check (length(trim(name)) > 0)
);
alter table public.holidays enable row level security;
create policy holidays_read on public.holidays for select to authenticated using (public.is_team());
create policy holidays_admin on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.holidays (day, name) values
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2027-01-26', 'Republic Day'),
  ('2027-08-15', 'Independence Day'),
  ('2027-10-02', 'Gandhi Jayanti')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_time_entries after update of status or delete on public.time_entries
  for each row execute function public.audit_row();
create trigger audit_events_tbl after insert or update or delete on public.events
  for each row execute function public.audit_row();
create trigger audit_leave after insert or update of status or delete on public.leave_requests
  for each row execute function public.audit_row();
