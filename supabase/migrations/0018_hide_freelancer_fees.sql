-- What freelancers are paid is pay, like salaries: members don't see those project costs either.
create or replace function public.member_sees_expense(p_kind text, p_project uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and p_kind <> 'claim' and p_project is not null
     and exists (select 1 from public.expense_categories c
                  where c.id = p_category and c.kind = 'pass_through' and c.name not ilike 'freelancer%');
$$;
