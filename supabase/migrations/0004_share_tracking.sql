-- shared_document: optional view tracking (PDF renders shouldn't count as views) and the
-- source document's number/date (credit notes must reference the original invoice).
drop function if exists public.shared_document(text);

create or replace function public.shared_document(p_token text, p_track boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; result jsonb;
begin
  select * into d from public.documents
   where share_token = p_token and share_enabled and status not in ('draft', 'awaiting_approval');
  if not found then return null; end if;
  if p_track then
    update public.documents
       set view_count = view_count + 1,
           first_viewed_at = coalesce(first_viewed_at, now()),
           last_viewed_at = now()
     where id = d.id;
  end if;
  select to_jsonb(d) - 'created_by'
         || jsonb_build_object(
              'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.document_items i where i.document_id = d.id), '[]'),
              'balance', (select to_jsonb(b) from public.document_balances b where b.id = d.id),
              'source', (select jsonb_build_object('doc_type', s.doc_type, 'number', s.number, 'issue_date', s.issue_date)
                           from public.documents s where s.id = d.source_id))
    into result;
  return result;
end $$;
grant execute on function public.shared_document(text, boolean) to anon, authenticated;
