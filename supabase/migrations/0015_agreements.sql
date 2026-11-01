-- Proposals, contracts and other agreements, with click-to-sign (email OTP), an append-only
-- hash-chained event log and a SHA-256 of the signed PDF.
-- Signers never log in: the public signing page works through the server (service role) with
-- each signer's own token, so no public RLS policies exist on these tables.

create table public.agreement_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  kind        text not null default 'contract' check (kind in ('proposal', 'contract', 'nda', 'freelancer', 'model_release', 'licence', 'other')),
  description text not null default '',
  body        text not null default '',         -- light markdown with {{merge.fields}}
  items       jsonb not null default '[]',      -- proposal pricing: [{title, description, amount, optional, selected}]
  ends_after_months int,                        -- contracts: default term, for renewal reminders
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger agreement_templates_touch before update on public.agreement_templates for each row execute function public.touch_updated_at();

create sequence public.agreement_number_seq;

create table public.agreements (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('AG-' || lpad(nextval('public.agreement_number_seq')::text, 4, '0')),
  title         text not null check (length(trim(title)) > 0),
  kind          text not null default 'contract' check (kind in ('proposal', 'contract', 'nda', 'freelancer', 'model_release', 'licence', 'other')),
  status        text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'declined', 'expired', 'void')),
  template_id   uuid references public.agreement_templates(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  body          text not null default '',
  items         jsonb not null default '[]',
  currency      text not null default 'INR',
  gst_rate      numeric(5,2) not null default 18,
  message       text not null default '',           -- note in the signing email
  expires_on    date,                               -- unsigned offers lapse after this
  starts_on     date,
  ends_on       date,                               -- for renewal reminders
  renewal_notice_days int not null default 30,
  renewal_reminded_on date,
  sent_at       timestamptz,
  completed_at  timestamptz,
  final_hash    text,                               -- SHA-256 (hex) of the signed PDF
  signed_pdf_path text,                             -- storage: files/agreements/<id>/<number>.pdf
  quote_id      uuid references public.documents(id) on delete set null,
  created_by    text not null default public.my_email(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index agreements_status_idx on public.agreements (status, created_at desc);
create index agreements_client_idx on public.agreements (client_id);
create index agreements_ends_idx on public.agreements (ends_on) where status = 'signed';
create index agreements_hash_idx on public.agreements (final_hash) where final_hash is not null;
create trigger agreements_touch before update on public.agreements for each row execute function public.touch_updated_at();

-- What was sent can't change: once out of draft, only status/dates/hash fields move.
create or replace function public.guard_agreement() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if old.status <> 'draft' and (new.body, new.items, new.title, new.kind, new.gst_rate, new.currency, new.client_id)
       is distinct from (old.body, old.items, old.title, old.kind, old.gst_rate, old.currency, old.client_id) then
    raise exception 'A sent agreement can''t be edited. Void it and make a new one.' using errcode = '42501';
  end if;
  if (new.final_hash, new.signed_pdf_path, new.completed_at) is distinct from (old.final_hash, old.signed_pdf_path, old.completed_at) then
    raise exception 'signing fields are set by the signing flow only' using errcode = '42501';
  end if;
  if new.status = 'signed' and old.status <> 'signed' then
    raise exception 'only the signing flow can mark an agreement signed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger agreements_guard before update on public.agreements for each row execute function public.guard_agreement();

create table public.agreement_signers (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.agreements(id) on delete cascade,
  position      int not null default 1,
  party         text not null default 'client' check (party in ('client', 'studio', 'other')),
  name          text not null check (length(trim(name)) > 0),
  email         text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token         text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  otp_hash      text,
  otp_expires_at timestamptz,
  otp_attempts  int not null default 0,
  otp_sent_count int not null default 0,
  otp_window_start timestamptz,
  verified_at   timestamptz,
  viewed_at     timestamptz,
  signed_at     timestamptz,
  signature_name text,
  signature_image text,                            -- optional drawn signature (PNG data URL)
  signed_ip     text,
  signed_user_agent text,
  declined_at   timestamptz,
  decline_reason text not null default '',
  reminded_at   timestamptz,
  reminder_count int not null default 0,
  created_at    timestamptz not null default now()
);
create index agreement_signers_agreement_idx on public.agreement_signers (agreement_id, position);

-- Append-only evidence log. Each row's hash covers the previous row's hash (a chain), so any
-- later edit or deletion is detectable.
create table public.agreement_events (
  id            bigint generated always as identity primary key,
  agreement_id  uuid not null references public.agreements(id) on delete cascade,
  at            timestamptz not null default now(),
  action        text not null,
  actor         text not null default '',
  signer_id     uuid references public.agreement_signers(id) on delete set null,
  ip            text,
  user_agent    text,
  detail        jsonb not null default '{}',
  prev_hash     text,
  hash          text
);
create index agreement_events_agreement_idx on public.agreement_events (agreement_id, id);

create or replace function public.chain_agreement_event() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  select e.hash into new.prev_hash from public.agreement_events e where e.agreement_id = new.agreement_id order by e.id desc limit 1;
  new.at = coalesce(new.at, now());
  new.hash = encode(extensions.digest(
    coalesce(new.prev_hash, '') || '|' || new.agreement_id || '|' || to_char(new.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    new.action || '|' || new.actor || '|' || coalesce(new.ip, '') || '|' || new.detail::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger agreement_events_chain before insert on public.agreement_events for each row execute function public.chain_agreement_event();

create or replace function public.agreement_events_immutable() returns trigger
language plpgsql as $$
begin
  -- rows only disappear when their agreement is deleted (cascade from a draft)
  if tg_op = 'DELETE' and not exists (select 1 from public.agreements a where a.id = old.agreement_id) then return old; end if;
  raise exception 'the signing log can''t be changed' using errcode = '42501';
end $$;
create trigger agreement_events_no_update before update or delete on public.agreement_events for each row execute function public.agreement_events_immutable();

-- Only drafts can be deleted (sent ones are voided and kept).
create or replace function public.guard_agreement_delete() returns trigger
language plpgsql as $$
begin
  if auth.role() <> 'service_role' and old.status <> 'draft' then
    raise exception 'Only drafts can be deleted. Void a sent agreement instead.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger agreements_guard_delete before delete on public.agreements for each row execute function public.guard_agreement_delete();

-- RLS: staff read; editors write; signers go through the server only.
alter table public.agreement_templates enable row level security;
create policy agreement_templates_read on public.agreement_templates for select to authenticated using (public.is_member());
create policy agreement_templates_write on public.agreement_templates for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.agreements enable row level security;
create policy agreements_read on public.agreements for select to authenticated using (public.is_member());
create policy agreements_write on public.agreements for all to authenticated using (public.can_edit()) with check (public.can_edit());

alter table public.agreement_signers enable row level security;
create policy agreement_signers_read on public.agreement_signers for select to authenticated using (public.is_member());
create policy agreement_signers_write on public.agreement_signers for all to authenticated
  using (public.can_edit() and exists (select 1 from public.agreements a where a.id = agreement_id and a.status = 'draft'))
  with check (public.can_edit() and exists (select 1 from public.agreements a where a.id = agreement_id and a.status = 'draft'));

alter table public.agreement_events enable row level security;
create policy agreement_events_read on public.agreement_events for select to authenticated using (public.is_member());
create policy agreement_events_insert on public.agreement_events for insert to authenticated
  with check (public.can_edit() and actor = public.my_email() and signer_id is null);

-- Signer tokens and OTP data never leave the server: the API roles can read only these columns.
revoke select on public.agreement_signers from anon, authenticated;
grant select (id, agreement_id, position, party, name, email, verified_at, viewed_at, signed_at, signature_name, signed_ip,
              declined_at, decline_reason, reminded_at, reminder_count, created_at) on public.agreement_signers to authenticated;

create trigger audit_agreements after insert or update or delete on public.agreements for each row execute function public.audit_row();

-- Anyone can check a PDF's fingerprint (only facts that are already on the certificate come back).
create or replace function public.verify_agreement_hash(p_hash text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', a.number, 'title', a.title, 'completed_at', a.completed_at,
           'signers', (select jsonb_agg(jsonb_build_object('name', s.name, 'signed_at', s.signed_at) order by s.position)
                         from public.agreement_signers s where s.agreement_id = a.id))
    from public.agreements a
   where a.final_hash = lower(p_hash) and a.status = 'signed' and p_hash ~* '^[0-9a-f]{64}$'
$$;
revoke execute on function public.verify_agreement_hash(text) from public;
grant execute on function public.verify_agreement_hash(text) to anon, authenticated;

-- Starter templates: plain-English, India-focused. Not legal advice.
insert into public.agreement_templates (name, kind, description, body, items, ends_after_months, sort) values
('Proposal: brand identity', 'proposal', 'Scope, timeline and pricing with optional add-ons the client can tick.',
$$# {{title}}

Prepared for **{{client.name}}** by {{studio.name}} on {{date}}.

## What you get
- Discovery workshop and moodboard
- Two logo routes, refined into one final mark
- Colour palette, type system and a short brand guide (PDF)
- Final files in AI, SVG, PNG and PDF

## How we'll work
1. **Week 1:** discovery call and moodboard.
2. **Weeks 2–3:** two creative routes, then one round of refinement on the chosen route.
3. **Week 4:** final artwork and brand guide.

Two rounds of revisions are included. More rounds are billed at our usual rates.

## Investment
The pricing below is before GST at {{gst_rate}}%. Tick the add-ons you'd like; the total updates as you go.

## Terms
- 50% advance to start, balance on delivery.
- Rights in the final, approved artwork pass to you once paid in full. We may show the work in our portfolio.
- This proposal is valid until {{valid_until}}.$$,
'[{"title":"Brand identity","description":"Logo, palette, type system, brand guide","amount":120000,"optional":false,"selected":true},{"title":"Stationery set","description":"Business card, letterhead, email signature","amount":25000,"optional":true,"selected":false},{"title":"Social media kit","description":"Profile images, 6 post templates, highlight covers","amount":30000,"optional":true,"selected":false}]',
null, 1),
('Service agreement', 'contract', 'For any client project: scope, fees, payments, revisions, IP, cancellation.',
$$# Service agreement

This agreement is made on {{date}} between **{{studio.legal_name}}** ({{studio.address}}, GSTIN {{studio.gstin}}), "the Studio", and **{{client.name}}** ({{client.address}}{{client.gstin_line}}), "the Client".

## 1. The work
The Studio will deliver: **{{project.name}}**, as described in the attached proposal or quote. Anything outside that scope is quoted separately.

## 2. Fees and payment
- Fee: **{{fee}}** plus GST at the applicable rate.
- 50% advance before work starts; the balance within 15 days of delivery.
- Late payments may attract interest under the MSMED Act, 2006 where it applies.
- If the Client deducts TDS, the Client will deposit it on time and share Form 16A.

## 3. Revisions and approvals
Two rounds of revisions are included per deliverable. Approval by email or in writing counts as final sign-off.

## 4. Rights in the work
On full payment, the Studio assigns to the Client the copyright in the final approved deliverables, worldwide and for their full term, for all uses (Section 19, Copyright Act, 1957). Drafts, unused concepts, source files not listed as deliverables, and the Studio's pre-existing tools and stock remain the Studio's. The Studio may show the work in its portfolio unless agreed otherwise in writing.

## 5. Shoots and third parties
Location, model, prop and travel costs are billed at actuals unless included in the fee. Stock, fonts and music are licensed in the Client's name where needed.

## 6. Cancellation
If the Client cancels, work done to date is payable, and the advance is not refundable. Shoot days cancelled within 48 hours are billed at 50%.

## 7. Confidentiality
Both parties keep each other's non-public information confidential, during and after this agreement.

## 8. Liability
Each party's total liability is capped at the fees paid under this agreement, except for unpaid fees and breach of confidentiality.

## 9. Term
This agreement runs from {{start_date}} until {{end_date}}, or until the work is delivered and paid for.

## 10. Law and disputes
Indian law applies. Disputes go first to good-faith discussion, then to the courts at {{studio.city}}.

Signed electronically under the Information Technology Act, 2000.$$,
'[]', 12, 2),
('Mutual NDA', 'nda', 'Both sides keep each other''s information confidential for two years.',
$$# Mutual non-disclosure agreement

This agreement is made on {{date}} between **{{studio.legal_name}}** and **{{client.name}}** ("the Parties").

1. **Confidential information** means anything one Party shares with the other that is marked confidential or would reasonably be seen as confidential: briefs, unreleased products, strategy, pricing, designs and files.
2. Each Party will use the other's confidential information only to discuss or deliver work together, and will share it only with people who need it and are bound by similar duties.
3. This does not cover information that is public, already known, independently developed, or that must be disclosed by law.
4. On request, each Party will return or delete the other's confidential information.
5. These duties last for **two years** from the date above.
6. Indian law applies; courts at {{studio.city}} have jurisdiction.

Signed electronically under the Information Technology Act, 2000.$$,
'[]', 24, 3),
('Freelancer agreement', 'freelancer', 'For photographers, designers and crew working on studio projects.',
$$# Freelancer agreement

This agreement is made on {{date}} between **{{studio.legal_name}}** ("the Studio") and the freelancer signing below ("the Freelancer"), for **{{project.name}}**.

## 1. The work
The Freelancer will deliver the work described in the brief by the agreed dates, to a professional standard.

## 2. Fee
**{{fee}}**, payable within 15 days of an invoice for accepted work. TDS will be deducted where the law requires it.

## 3. Rights
The Freelancer assigns to the Studio all copyright in the work made under this agreement, worldwide and for its full term, for all media and uses (Section 19, Copyright Act, 1957), so the Studio can pass those rights to its client. The Freelancer may show the work in a portfolio only after the client has published it, and with credit to the Studio.

## 4. Confidentiality
Client names, briefs, unreleased products and files are confidential. The Freelancer won't post or share them without written permission.

## 5. Independent contractor
The Freelancer is not an employee and is responsible for their own taxes, equipment and insurance.

## 6. Law
Indian law applies; courts at {{studio.city}} have jurisdiction.

Signed electronically under the Information Technology Act, 2000.$$,
'[]', null, 4),
('Model release', 'model_release', 'Permission to use a person''s image from a shoot.',
$$# Model release

On {{date}}, I took part in a shoot by **{{studio.legal_name}}** for **{{client.name}}** ({{project.name}}).

1. I allow the Studio and its client to use photographs and video of me from this shoot in advertising, packaging, social media, websites and print, worldwide, for the period agreed below.
2. Images may be retouched, cropped and combined with other material, but not in a way that is defamatory or misleading about me.
3. I have been paid, or will be paid, the agreed fee: **{{fee}}**. No further payment is due for these uses.
4. Usage period: until {{end_date}}.

Signed electronically under the Information Technology Act, 2000.$$,
'[]', 24, 5),
('Usage licence', 'licence', 'Licence for a client to use photographs for a fixed period, media and territory.',
$$# Image usage licence

**{{studio.legal_name}}** licenses **{{client.name}}** to use the photographs from **{{project.name}}** as follows:

- **Media:** digital, social media and website (add print or outdoor if agreed)
- **Territory:** India
- **Period:** {{start_date}} to {{end_date}}
- **Fee:** {{fee}} plus GST

Copyright stays with the Studio. Any use outside these terms, or after the end date, needs a new licence. The Studio will remind the Client before this licence ends.

Signed electronically under the Information Technology Act, 2000.$$,
'[]', 12, 6);
