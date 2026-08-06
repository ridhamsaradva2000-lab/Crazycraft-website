-- 20260725120700_create_activity_and_capi_tables.sql
-- Replaces the unsafe "lead_id + lead_type" polymorphic pattern with real,
-- FK-enforced references. A row can never point at a nonexistent lead.

create table lead_activity_log (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references inquiries(id) on delete cascade,
  quote_request_id uuid references quote_requests(id) on delete cascade,
  sample_id uuid references samples(id) on delete cascade,
  event_type text not null, -- e.g. 'status_change', 'note', 'email_sent', 'call_logged'
  note text,
  created_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Exactly one parent reference must be set — an activity row always
  -- belongs to precisely one inquiry, quote request, or sample.
  constraint chk_lead_activity_log_exactly_one_parent check (
    (case when inquiry_id is not null then 1 else 0 end) +
    (case when quote_request_id is not null then 1 else 0 end) +
    (case when sample_id is not null then 1 else 0 end) = 1
  )
);

create index idx_lead_activity_log_inquiry_id on lead_activity_log(inquiry_id);
create index idx_lead_activity_log_quote_request_id on lead_activity_log(quote_request_id);
create index idx_lead_activity_log_sample_id on lead_activity_log(sample_id);
create index idx_lead_activity_log_created_at on lead_activity_log(created_at desc);

-- Outbox pattern: form submission writes here immediately; a separate
-- worker/cron sends to Meta and updates status, so CAPI latency/failures
-- never block the user-facing form response.
create table capi_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null, -- 'Lead', 'RFQQualified', 'CompleteRFQ', etc.
  event_id uuid not null, -- shared with the client-side Pixel event for dedup

  -- At most one parent — some events (PageView, ViewContent) have no
  -- associated lead row at all, so unlike lead_activity_log this allows zero.
  inquiry_id uuid references inquiries(id) on delete cascade,
  quote_request_id uuid references quote_requests(id) on delete cascade,
  sample_id uuid references samples(id) on delete cascade,
  constraint chk_capi_events_at_most_one_parent check (
    (case when inquiry_id is not null then 1 else 0 end) +
    (case when quote_request_id is not null then 1 else 0 end) +
    (case when sample_id is not null then 1 else 0 end) <= 1
  ),

  payload jsonb not null,
  constraint chk_capi_events_payload_is_object check (jsonb_typeof(payload) = 'object'),

  status capi_event_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),

  -- Deduplication: Meta de-dupes Pixel + CAPI events sharing an event_id,
  -- but our own outbox must not enqueue the same (event_name, event_id)
  -- pair twice even if a retry or a double form-submit occurs upstream.
  constraint uq_capi_events_event_name_event_id unique (event_name, event_id)
);

create index idx_capi_events_status on capi_events(status);
create index idx_capi_events_inquiry_id on capi_events(inquiry_id);
create index idx_capi_events_quote_request_id on capi_events(quote_request_id);
create index idx_capi_events_sample_id on capi_events(sample_id);

comment on column capi_events.payload is
  'Must contain only hashed PII (SHA-256 em/ph) plus non-PII fields. Never store raw email/phone here.';

-- Delivery log for debugging match-rate issues. Stores response metadata
-- only — never raw request bodies with PII.
create table capi_event_log (
  id uuid primary key default gen_random_uuid(),
  capi_event_id uuid not null references capi_events(id) on delete cascade,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now()
);

create index idx_capi_event_log_capi_event_id on capi_event_log(capi_event_id);
