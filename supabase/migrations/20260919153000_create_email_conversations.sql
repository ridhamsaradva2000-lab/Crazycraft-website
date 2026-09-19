-- =========================================================================
-- Phase 1B: Sales/RFQ email conversation + message foundation.
-- New tables/objects only. No ALTER to inquiries, quote_requests, or any
-- existing table. No changes to submit_inquiry or any existing RPC.
--
-- DESIGN NOTE -- quote_request_id intentionally OMITTED from this migration:
-- Phase 1B implements ONLY the website-inquiry path (Route A). No code in
-- this phase creates a conversation from a quote_request. Adding a nullable
-- quote_request_id column now, with an "exactly one source" CHECK and its
-- own partial unique index, would be speculative complexity for a path that
-- does not exist yet. inquiry_id is therefore NOT NULL -- every Phase 1B
-- conversation has exactly one, unambiguous source by construction, with no
-- CHECK constraint needed to enforce it. Adding quote_request_id later is a
-- simple additive migration (nullable column, exactly-one CHECK, partial
-- unique index) when that integration phase is actually designed -- it does
-- not require touching this migration or any table created here.
-- =========================================================================

-- Plain CREATE, not "IF NOT EXISTS" -- an unexpected name collision must
-- fail this migration loudly, not silently reuse or skip an existing object.
create sequence public.rfq_reference_seq;

-- Plain CREATE FUNCTION, not "OR REPLACE" -- same reasoning: a name
-- collision here must fail the migration, not silently overwrite whatever
-- already has this name.
create function public.generate_rfq_reference()
returns text
language sql
as $$
  select 'RFQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.rfq_reference_seq')::text, 5, '0');
$$;

revoke all on sequence public.rfq_reference_seq from public, anon, authenticated;
grant usage on sequence public.rfq_reference_seq to service_role;

revoke all on function public.generate_rfq_reference() from public, anon, authenticated;
grant execute on function public.generate_rfq_reference() to service_role;

create table public.email_conversations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete restrict,
  rfq_reference text not null unique default public.generate_rfq_reference(),
  buyer_email text not null,
  subject text not null,
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  provider text not null default 'gmail',
  provider_thread_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_conversations_one_per_inquiry unique (inquiry_id)
);

create index email_conversations_buyer_email_idx on public.email_conversations (buyer_email);
create index email_conversations_provider_thread_id_idx on public.email_conversations (provider_thread_id) where provider_thread_id is not null;

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.email_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  purpose text not null default 'general' check (purpose in ('acknowledgement', 'quotation', 'negotiation', 'follow_up', 'general')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sender_email text not null,
  sender_name text null,
  recipient_email text not null,
  subject text not null,
  text_body text not null,
  html_body text null,
  provider text not null default 'gmail',
  provider_message_id text null,
  provider_thread_id text null,
  rfc_message_id text null,
  in_reply_to text null,
  references_header text null,
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_messages_one_acknowledgement_per_conversation
  on public.email_messages (conversation_id)
  where purpose = 'acknowledgement';

create unique index email_messages_provider_message_id_unique
  on public.email_messages (provider_message_id)
  where provider_message_id is not null;

create index email_messages_conversation_id_idx on public.email_messages (conversation_id);
create index email_messages_provider_thread_id_idx on public.email_messages (provider_thread_id) where provider_thread_id is not null;

alter table public.email_conversations enable row level security;
alter table public.email_messages enable row level security;

revoke all on table public.email_conversations from public, anon, authenticated;
revoke all on table public.email_messages from public, anon, authenticated;

grant select on public.email_conversations to authenticated;
grant select on public.email_messages to authenticated;

create policy "sales role can view email_conversations"
  on public.email_conversations
  for select
  to authenticated
  using (private.has_admin_role('sales'::public.admin_role));

create policy "sales role can view email_messages"
  on public.email_messages
  for select
  to authenticated
  using (private.has_admin_role('sales'::public.admin_role));

grant select, insert, update on public.email_conversations to service_role;
grant select, insert, update on public.email_messages to service_role;
