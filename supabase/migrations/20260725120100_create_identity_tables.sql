-- 20260725120100_create_identity_tables.sql
-- Both tables extend Supabase's built-in auth.users. Almost every other
-- table references admin_users (assignment/authorship) or buyers
-- (account ownership), so these come first. Protective triggers are added
-- in a later migration once the private-schema helper functions exist.

create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role admin_role not null default 'sales',
  created_at timestamptz not null default now()
);

comment on table admin_users is
  'Internal staff accounts. Created manually / via invite flow, never public self-signup (Module 3).';

create table buyers (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  business_type business_type not null,
  country text not null,
  phone text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table buyers is
  'Optional B2B buyer accounts. verified=false until an admin explicitly approves the company via the admin_verify_buyer() RPC or a direct admin-gated update.';

create index idx_buyers_business_type on buyers(business_type);
create index idx_buyers_country on buyers(country);
