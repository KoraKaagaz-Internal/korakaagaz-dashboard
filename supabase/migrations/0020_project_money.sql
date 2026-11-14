-- Money received can be logged straight on a project (no invoice needed), and each project's
-- team split is kept as project expenses in a "Freelancer: team split" category.

-- 1. Payments: on an invoice, on a project, or both. Admin-only RLS from 0016 is unchanged.
alter table public.payments alter column document_id drop not null;
alter table public.payments add column if not exists project_id uuid references public.projects(id) on delete restrict;  -- never lose money records with a project
alter table public.payments add constraint payments_target check (document_id is not null or project_id is not null);
create index if not exists payments_project_idx on public.payments (project_id);

-- A payment on an invoice belongs to the invoice's project, so project totals see it too.
create or replace function public.payment_project() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.document_id is not null and new.project_id is null then
    select d.project_id into new.project_id from public.documents d where d.id = new.document_id;
  end if;
  return new;
end $$;
drop trigger if exists payment_project on public.payments;
create trigger payment_project before insert on public.payments for each row execute function public.payment_project();

update public.payments p set project_id = d.project_id
  from public.documents d where d.id = p.document_id and p.project_id is null and d.project_id is not null;

-- 2. Team split category. The "freelancer" name keeps it hidden from members (member_sees_expense, 0018).
insert into public.expense_categories (name, itc_rule, kind, tds_nature, rcm, sort)
values ('Freelancer: team split', 'none', 'pass_through', 'none', false, 5)
on conflict (name) do nothing;
