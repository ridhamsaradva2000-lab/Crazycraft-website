-- 20260725120600_create_samples_table.sql
-- Implements the sample-request workflow from the frozen architecture
-- (Request a Sample CTA / SampleRequestForm). Schema and RLS only — no UI.

create table samples (
  id uuid primary key default gen_random_uuid(),

  -- Requester — either an authenticated buyer or a guest.
  buyer_id uuid references buyers(id) on delete set null,
  name text not null,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  phone text,
  company_name text,
  country text not null,

  -- Optional link to how this sample request originated. At most one of
  -- these should be set (a sample can also stand alone with neither).
  inquiry_id uuid references inquiries(id) on delete set null,
  quote_request_id uuid references quote_requests(id) on delete set null,
  check (
    not (inquiry_id is not null and quote_request_id is not null)
  ),

  -- Product and quantity — buyer-facing.
  product_id uuid not null references products(id) on delete restrict,
  requested_quantity integer not null default 1 check (requested_quantity > 0),

  -- ── Admin-controlled fields (protected by grants + guard triggers +
  --    admin_update_sample_status() RPC — see later migrations) ─────────
  sample_charge numeric(10, 2) not null default 0 check (sample_charge >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_status payment_status not null default 'unpaid',
  shipping_country text,
  shipping_address text,
  shipping_port text,
  courier_name text,
  tracking_number text,
  sample_status sample_status not null default 'requested',
  assigned_to uuid references admin_users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_samples_buyer_id on samples(buyer_id);
create index idx_samples_product_id on samples(product_id);
create index idx_samples_inquiry_id on samples(inquiry_id);
create index idx_samples_quote_request_id on samples(quote_request_id);
create index idx_samples_assigned_to on samples(assigned_to);
create index idx_samples_sample_status on samples(sample_status);
create index idx_samples_email_normalized on samples(email_normalized);

comment on table samples is
  'Sample requests. A public/guest requester can only ever create a row in the requested/unpaid state — every lifecycle field is admin-only, enforced by grants, guard triggers, and the admin_update_sample_status() RPC.';
