-- Module 7: consent-gated Meta Lead outbox + retry leasing.
--
-- The trusted Server Action generates event_id only after independently
-- validating the versioned marketing-consent cookie and Pixel config.
-- submit_inquiry() is service_role-only. Therefore a non-null
-- inquiry.event_id is the trusted signal for atomically enqueueing a
-- Meta Lead outbox row.
--
-- Existing historical inquiries are deliberately NOT backfilled because
-- valid marketing consent at their original event time cannot be proven.

alter table public.capi_events
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz;

create index if not exists idx_capi_events_retry_ready
  on public.capi_events(status, next_attempt_at, created_at)
  where status in ('pending'::public.capi_event_status, 'failed'::public.capi_event_status);

comment on column public.capi_events.next_attempt_at is
'Worker retry eligibility timestamp; advanced with bounded backoff after failed delivery attempts.';

comment on column public.capi_events.processing_started_at is
'Short worker lease timestamp. Stale leases can be reclaimed after an interrupted invocation.';

create or replace function public.enqueue_inquiry_capi_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.capi_events (
    event_name,
    event_id,
    inquiry_id,
    payload
  )
  values (
    'Lead',
    new.event_id,
    new.id,
    '{}'::jsonb
  )
  on conflict (event_name, event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_inquiry_capi_lead() from public, anon, authenticated;

drop trigger if exists trg_enqueue_inquiry_capi_lead on public.inquiries;

create trigger trg_enqueue_inquiry_capi_lead
after insert on public.inquiries
for each row
when (new.event_id is not null)
execute function public.enqueue_inquiry_capi_lead();
