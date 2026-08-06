-- seed.sql
--
-- LOCAL / TEST / DEMO DATA ONLY. Production-required reference data (lead
-- scoring rules, categories, site settings) now lives in
-- migrations/20260725121500_create_bootstrap_data.sql and is applied to
-- every environment via `supabase db push` / `db reset`. This file is
-- only ever run locally (`supabase db reset` runs it automatically after
-- migrations) or manually against a non-production project — never
-- applied automatically to a hosted/production project.
--
-- Adds a couple of demo products on top of the bootstrap categories so
-- local development has something to look at immediately.

insert into products (id, slug, name, short_description, category_id, moq, lead_time_days, status)
select
  '88888888-8888-8888-8888-888888888881',
  'demo-cobalt-vase',
  'Demo Cobalt Blue Pottery Vase',
  'Hand-painted demo vase for local development only.',
  id,
  500,
null,
  'published'
from categories where slug = 'blue-pottery'
on conflict (id) do nothing;

insert into product_images (product_id, url, alt_text, is_primary)
values (
  '88888888-8888-8888-8888-888888888881',
  'https://placehold.co/600x600.png?text=Demo+Vase',
  'Demo cobalt blue pottery vase, front view',
  true
)
on conflict do nothing;
