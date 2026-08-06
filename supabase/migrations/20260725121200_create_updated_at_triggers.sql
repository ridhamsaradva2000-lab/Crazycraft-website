-- 20260725121200_create_updated_at_triggers.sql

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger trg_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create trigger trg_product_images_updated_at
  before update on public.product_images
  for each row execute function public.set_updated_at();

create trigger trg_product_variants_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

create trigger trg_lead_scoring_rules_updated_at
  before update on public.lead_scoring_rules
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

create trigger trg_inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create trigger trg_quote_requests_updated_at
  before update on public.quote_requests
  for each row execute function public.set_updated_at();

create trigger trg_samples_updated_at
  before update on public.samples
  for each row execute function public.set_updated_at();
