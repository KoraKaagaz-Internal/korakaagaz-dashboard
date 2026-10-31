-- Remember how far a lead got (a lost lead may have reached "proposal"), for the funnel.
alter table public.leads add column furthest_stage text not null default 'enquiry'
  check (furthest_stage in ('enquiry', 'discovery', 'proposal', 'negotiation', 'won'));

create or replace function public.lead_stage_dates() returns trigger
language plpgsql as $$
declare ranks text[] := array['enquiry', 'discovery', 'proposal', 'negotiation', 'won'];
begin
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage <> 'won') then new.won_at = now(); end if;
  if new.stage = 'lost' and (tg_op = 'INSERT' or old.stage <> 'lost') then new.lost_at = now(); end if;
  if new.stage not in ('won', 'lost') then new.won_at = null; new.lost_at = null; end if;
  if new.stage <> 'lost' and array_position(ranks, new.stage) > array_position(ranks, coalesce(case when tg_op = 'UPDATE' then old.furthest_stage end, 'enquiry')) then
    new.furthest_stage = new.stage;
  elsif tg_op = 'UPDATE' then
    new.furthest_stage = old.furthest_stage;
  end if;
  return new;
end $$;
