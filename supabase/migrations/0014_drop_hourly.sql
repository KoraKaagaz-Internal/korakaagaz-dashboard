-- No hourly pay anywhere: projects bill by fixed fee or monthly retainer, time is plain hours.
-- People costs come in through Expenses ("Salaries & retainers"), not per-hour cost rates.

update public.project_finance set billing = 'fixed' where billing = 'hourly';
update public.project_templates set billing = 'fixed' where billing = 'hourly';
alter table public.project_finance drop constraint if exists project_finance_billing_check;
alter table public.project_finance add constraint project_finance_billing_check check (billing in ('fixed', 'retainer'));
alter table public.project_templates drop constraint if exists project_templates_billing_check;
alter table public.project_templates add constraint project_templates_billing_check check (billing in ('fixed', 'retainer'));
alter table public.project_finance drop column if exists hourly_rate;

drop function if exists public.admin_member_rates();
drop function if exists public.admin_set_rates(text, numeric, numeric, numeric);
drop function if exists public.admin_project_costs(date, date);
drop function if exists public.admin_time_costs_by_month(date, date);
alter table public.members drop column if exists cost_rate, drop column if exists bill_rate;

-- Weekly hours per person (for workload and utilisation), admin only.
create or replace function public.admin_set_capacity(p_email text, p_hours numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_hours is null or p_hours < 0 or p_hours > 80 then raise exception 'hours must be 0–80' using errcode = '22023'; end if;
  update public.members set weekly_capacity_hours = p_hours where email = lower(p_email);
end $$;
revoke execute on function public.admin_set_capacity(text, numeric) from public, anon;
grant execute on function public.admin_set_capacity(text, numeric) to authenticated;

-- Timesheet approval is optional; off means logged hours count straight away.
alter table public.settings add column if not exists time_approval boolean not null default false;
-- Readable by everyone on the team (freelancers can't read settings).
create or replace function public.time_approval_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select time_approval from public.settings where id = 1), false) and public.is_team();
$$;
revoke execute on function public.time_approval_on() from public, anon;
grant execute on function public.time_approval_on() to authenticated;

insert into public.expense_categories (name, itc_rule, kind, tds_nature, rcm, sort)
values ('Salaries & retainers', 'none', 'overhead', 'none', false, 0)
on conflict (name) do nothing;
