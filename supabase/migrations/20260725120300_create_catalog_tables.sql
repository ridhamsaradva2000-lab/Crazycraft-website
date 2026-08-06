-- 20260725120300_create_catalog_tables.sql
-- Product catalog: categories, collections, products, images, variants.
-- All integrity constraints and indexes are defined inline at creation
-- time since this is a fresh schema (no prior deployment to preserve).
-- Table/type references are explicitly schema-qualified (public.*) in
-- every constraint added in this revision.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Canonical lowercase, hyphenated slug — "blue-pottery", not
  -- "Blue_Pottery" or "blue pottery". Rejects the row outright rather than
  -- silently lowercasing/rewriting it, so the caller knows immediately.
  constraint chk_categories_slug_canonical check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- A category can never be its own direct parent. (Does not detect
  -- longer cycles like A -> B -> A; that would need a recursive check via
  -- trigger, which is out of scope for this patch.)
  constraint chk_categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index idx_categories_parent_id on public.categories(parent_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_collections_slug_canonical check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  short_description text,
  category_id uuid references public.categories(id) on delete set null,

  moq integer not null default 1 check (moq >= 1),
  lead_time_days integer check (lead_time_days >= 0),
  base_material text,
  dimensions text,
  weight_grams integer check (weight_grams >= 0),
  hs_code text,
  is_customizable boolean not null default false,
  customization_notes text,

  meta_title text,
  meta_description text,
  status public.product_status not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_products_slug_canonical check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index idx_products_category_id on public.products(category_id);
create index idx_products_status on public.products(status);

create table public.product_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);

-- The composite PK covers product_id as the leading column; collection_id
-- lookups ("which products are in this collection") need their own index.
create index idx_product_collections_collection_id on public.product_collections(collection_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text not null, -- required, not optional: image SEO is a stated priority
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_images_product_id on public.product_images(product_id);

-- Partial unique index: at most one primary image per product. A plain
-- unique(product_id, is_primary) would also block having many
-- is_primary=false rows per product, which is exactly what we need to allow.
create unique index uq_product_images_one_primary_per_product
  on public.product_images(product_id)
  where is_primary = true;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null, -- e.g. "Cobalt Blue / 30cm"
  sku text,
  sku_normalized text generated always as (lower(trim(sku))) stored,
  price_note text, -- B2B pricing is MOQ/negotiation-based, not a fixed public price
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A provided SKU can't be blank/whitespace-only — either omit it or
  -- give a real value.
  constraint chk_product_variants_sku_nonblank check (sku is null or length(trim(sku)) > 0),

  -- Target for quote_request_items' composite FK (product_variant_id,
  -- product_id) — this is what makes "variant belongs to product" a real,
  -- DB-enforced constraint rather than an application-only check.
  constraint uq_product_variants_id_product_id unique (id, product_id)
);

create index idx_product_variants_product_id on public.product_variants(product_id);

-- Unique on the NORMALIZED sku (case-insensitive), only when provided —
-- "ABC-123" and "abc-123" are treated as the same SKU. Many variants may
-- legitimately have no SKU yet, so NULLs are excluded entirely.
create unique index uq_product_variants_sku_normalized
  on public.product_variants(sku_normalized)
  where sku_normalized is not null;
