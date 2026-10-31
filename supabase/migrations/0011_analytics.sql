-- Analytics: approved time and its cost per month, project and person (admin only: exposes rates).
create or replace function public.admin_time_costs_by_month(p_from date, p_to date)
returns table (month date, project_id uuid, member_email text, minutes bigint, billable_minutes bigint, cost numeric, bill_value numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select date_trunc('month', t.work_date)::date, t.project_id, t.member_email,
           sum(t.minutes)::bigint,
           sum(case when t.billable then t.minutes else 0 end)::bigint,
           round(sum(t.minutes) / 60.0 * max(m.cost_rate), 2),
           round(sum(case when t.billable then t.minutes else 0 end) / 60.0 * max(m.bill_rate), 2)
      from public.time_entries t join public.members m on m.email = t.member_email
     where t.status = 'approved' and t.timer_started_at is null
       and t.work_date between p_from and p_to
     group by 1, 2, 3;
end $$;
revoke execute on function public.admin_time_costs_by_month(date, date) from public, anon;
grant execute on function public.admin_time_costs_by_month(date, date) to authenticated;
