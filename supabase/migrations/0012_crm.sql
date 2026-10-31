-- CRM: leads pipeline, activity log, public enquiry form, discovery-call booking settings.

create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  company      text not null default '',
  email        text not null default '',
  phone        text not null default '',
  city         text not null default '',
  source       text not null default 'other' check (source in ('website', 'instagram', 'referral', 'whatsapp', 'email', 'event', 'repeat', 'other')),
  service      text not null default '',
  budget       text not null default '',          -- what they said, e.g. "₹50k–1L"
  value        numeric(14,2) not null default 0, -- our estimate of the deal
  stage        text not null default 'enquiry' check (stage in ('enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost')),
  lost_reason  text not null default '',
  owner_email  text references public.members(email) on update cascade on delete set null,
  follow_up_on date,
  message      text not null default '',         -- what they wrote in the enquiry
  notes        text not null default '',
  client_id    uuid references public.clients(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  sort         double precision not null default 0,
  ip_hash      text,                              -- public form rate limiting (hashed, never the raw IP)
  won_at       timestamptz,
  lost_at      timestamptz,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index leads_stage_idx on public.leads (stage, sort);
create index leads_follow_idx on public.leads (follow_up_on) where stage not in ('won', 'lost');
create index leads_ip_idx on public.leads (ip_hash, created_at) where ip_hash is not null;

create table public.lead_activities (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  kind         text not null default 'note' check (kind in ('note', 'call', 'email', 'meeting', 'whatsapp', 'stage', 'system')),
  body         text not null default '',
  author_email text not null default public.my_email(),
  at           timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, at desc);

create or replace function public.lead_stage_dates() returns trigger
language plpgsql as $$
begin
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage <> 'won') then new.won_at = now(); end if;
  if new.stage = 'lost' and (tg_op = 'INSERT' or old.stage <> 'lost') then new.lost_at = now(); end if;
  if new.stage not in ('won', 'lost') then new.won_at = null; new.lost_at = null; end if;
  return new;
end $$;
create trigger leads_stage_dates before insert or update of stage on public.leads for each row execute function public.lead_stage_dates();
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
create policy leads_read on public.leads for select to authenticated using (public.is_member());
create policy leads_write on public.leads for all to authenticated using (public.can_edit()) with check (public.can_edit());
alter table public.lead_activities enable row level security;
create policy lead_activities_read on public.lead_activities for select to authenticated using (public.is_member());
create policy lead_activities_insert on public.lead_activities for insert to authenticated
  with check (public.can_edit() and author_email = public.my_email());
create policy lead_activities_delete on public.lead_activities for delete to authenticated
  using (author_email = public.my_email() or public.is_admin());

create trigger audit_leads after insert or update or delete on public.leads for each row execute function public.audit_row();

-- Discovery-call booking page + enquiry form settings (public pages read them through the server).
alter table public.settings
  add column booking jsonb not null default '{"enabled": false, "slug": "kora-kaagaz", "title": "Discovery call", "minutes": 30, "days": [1,2,3,4,5], "start": "11:00", "end": "18:00", "buffer": 15, "notice_hours": 12, "horizon_days": 21, "location": "Google Meet (link sent by email)"}',
  add column enquiry_services text[] not null default array['Brand identity', 'Product photography', 'Campaign shoot', 'Social media retainer', 'Packaging', 'Website', 'Something else'];
