-- 20260725120800_create_attribution_and_cms_tables.sql
-- Session-level attribution touchpoints, plus admin CMS support tables.

create table attribution_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  event_type text not null, -- 'page_view', 'catalog_download', 'rfq_started', etc.
  page_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  landing_page text,
  created_at timestamptz not null default now()
);

create index idx_attribution_events_visitor_id on attribution_events(visitor_id);
create index idx_attribution_events_created_at on attribution_events(created_at desc);

create table media_library (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  filename text not null,
  alt_text text,
  tags text[] not null default '{}',
  uploaded_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_media_library_tags on media_library using gin(tags);
create index idx_media_library_uploaded_by on media_library(uploaded_by);

create table seo_metadata (
  id uuid primary key default gen_random_uuid(),
  page_path text not null unique, -- e.g. '/about', '/for-hotels'
  meta_title text,
  meta_description text,
  og_image text,
  canonical_url text
);

-- Single-row-per-key config store, non-secret display content only.
create table site_settings (
  key text primary key,
  value jsonb not null,
  constraint chk_site_settings_value_is_object check (jsonb_typeof(value) = 'object')
);

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  source text,
  subscribed_at timestamptz not null default now()
);

-- Unique on the NORMALIZED email, not the raw one — this is what actually
-- prevents "Foo@Example.com" and "foo@example.com" from creating two
-- subscriber rows. A plain unique(email) would miss exactly that case.
create unique index uq_newsletter_subscribers_email_normalized on newsletter_subscribers(email_normalized);
