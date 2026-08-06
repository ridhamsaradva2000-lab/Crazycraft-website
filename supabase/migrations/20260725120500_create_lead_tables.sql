-- 20260725120500_create_lead_tables.sql
-- Core lead-generation tables. inquiries and quote_requests stay separate
-- per the frozen architecture. Protective (guard) triggers and the
-- admin-only RPC functions are added in later migrations, once the
-- private-schema helpers exist for both.

create table inquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null, -- null = general inquiry

  -- Stage 1 (always present) — buyer-facing, freely submittable.
  qualification_stage smallint not null default 1 check (qualification_stage between 1 and 3),
  name text not null,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  country text not null,
  business_type business_type not null,
  inquiry_type inquiry_type not null default 'product',
  message text,

  -- Stage 2 (optional, incentivized) — buyer-facing.
  company_name text,
  company_website text,
  linkedin_url text,
  volume_range text,
  moq_familiarity moq_familiarity,
  timeline purchase_timeline,

  -- Stage 3 (high-intent only) — buyer-facing.
  shipping_country text,
  incoterm_preference incoterm,
  private_label_required boolean,

  -- Attribution — buyer-facing (captured automatically by the client, not
  -- hand-typed, but still originates from the requester's browser/session).
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  landing_page text,
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  last_touch_source text,
  last_touch_medium text,
  last_touch_campaign text,

  -- Meta Pixel/CAPI matching — fbp/fbc are Meta's own browser/click-ID
  -- cookies, not secrets; safe to store alongside the lead.
  fbp text,
  fbc text,
  event_id uuid,

  -- ── Admin-controlled fields (protected by grants + guard triggers +
  --    admin_update_inquiry() RPC — see later migrations) ──────────────
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  status lead_status not null default 'new',
  assigned_to uuid references admin_users(id) on delete set null,
  follow_up_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inquiries_status on inquiries(status);
create index idx_inquiries_assigned_to on inquiries(assigned_to);
create index idx_inquiries_email_normalized on inquiries(email_normalized);
create index idx_inquiries_lead_score on inquiries(lead_score desc);
create index idx_inquiries_created_at on inquiries(created_at desc);
create index idx_inquiries_product_id on inquiries(product_id);

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete set null, -- null = guest quote request

  -- Buyer-facing
  company_name text,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  phone text,
  country text,

  -- Attribution — buyer-facing
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  first_touch_source text,
  first_touch_medium text,
  last_touch_source text,
  last_touch_medium text,
  fbp text,
  fbc text,
  event_id uuid,

  -- ── Admin-controlled fields ──────────────────────────────────────────
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  status lead_status not null default 'new',
  assigned_to uuid references admin_users(id) on delete set null,
  follow_up_at timestamptz,
  notes text, -- internal sales notes — admin-only, never buyer-submitted

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_quote_requests_status on quote_requests(status);
create index idx_quote_requests_assigned_to on quote_requests(assigned_to);
create index idx_quote_requests_email_normalized on quote_requests(email_normalized);
create index idx_quote_requests_buyer_id on quote_requests(buyer_id);

-- Normalized line items — replaces the previous items JSONB column.
-- Authoritative, foreign-key-enforced, and queryable (e.g. "which products
-- appear most often in RFQs" is a plain GROUP BY instead of a JSONB scan).
create table quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_variant_id uuid,
  quantity integer not null check (quantity > 0),
  customization_notes text,
  created_at timestamptz not null default now(),

  -- Composite FK: when product_variant_id IS NULL, Postgres' default
  -- MATCH SIMPLE skips enforcement entirely (no variant chosen — fine).
  -- When it IS set, this forces (product_variant_id, product_id) to match
  -- an actual row in product_variants — i.e. the variant must belong to
  -- the exact product on this line item. A variant belonging to a
  -- different product can never be inserted here; the database rejects
  -- it, not just the application layer.
  constraint fk_quote_request_items_variant_matches_product
    foreign key (product_variant_id, product_id)
    references product_variants(id, product_id)
    on delete restrict
);

create index idx_quote_request_items_quote_request_id on quote_request_items(quote_request_id);
create index idx_quote_request_items_product_id on quote_request_items(product_id);
create index idx_quote_request_items_product_variant_id on quote_request_items(product_variant_id);

create table saved_products (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references buyers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, product_id)
);

create index idx_saved_products_product_id on saved_products(product_id);

-- Transparent, admin-editable scoring weights — a config table rather than
-- hardcoded logic, so weights can change without a schema migration.
create table lead_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  factor_key text not null unique,
  points integer not null,
  description text not null,
  updated_at timestamptz not null default now()
);
