-- 20260725121300_create_rls_policies.sql
--
-- Enables RLS on every table. Every policy explicitly names TO anon,
-- authenticated (or just one of them) rather than omitting the clause
-- (which would default to PUBLIC and apply identically, but explicit
-- targets make the intended audience auditable at a glance).

-- ── admin_users ──────────────────────────────────────────────────────────
alter table admin_users enable row level security;

create policy "admins can view own record"
  on admin_users for select to authenticated
  using (id = auth.uid());

create policy "super_admins can view all admin records"
  on admin_users for select to authenticated
  using (private.has_admin_role('super_admin'::admin_role));

create policy "super_admins manage admin_users"
  on admin_users for all to authenticated
  using (private.has_admin_role('super_admin'::admin_role))
  with check (private.has_admin_role('super_admin'::admin_role));

-- ── buyers ───────────────────────────────────────────────────────────────
alter table buyers enable row level security;

create policy "buyers can view own record"
  on buyers for select to authenticated
  using (id = auth.uid());

create policy "buyers can update own record"
  on buyers for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
  -- Column-level protection of `verified` is enforced by
  -- trg_buyers_guard_update (previous migration) and by the column GRANT
  -- in the next migration — RLS here only governs which ROW may be
  -- touched, not which columns within it.

create policy "buyers can insert own record"
  on buyers for insert to authenticated
  with check (id = auth.uid());

create policy "admins can view all buyers"
  on buyers for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "admins can update buyers"
  on buyers for update to authenticated
  using (private.has_admin_role('sales'::admin_role))
  with check (private.has_admin_role('sales'::admin_role));

-- ── categories / collections ────────────────────────────────────────────
alter table categories enable row level security;
alter table collections enable row level security;
alter table product_collections enable row level security;

create policy "public can view categories"
  on categories for select to anon, authenticated
  using (true);

create policy "admins manage categories"
  on categories for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "public can view collections"
  on collections for select to anon, authenticated
  using (true);

create policy "admins manage collections"
  on collections for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "public can view product_collections"
  on product_collections for select to anon, authenticated
  using (true);

create policy "admins manage product_collections"
  on product_collections for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ── products / images / variants ────────────────────────────────────────
alter table products enable row level security;
alter table product_images enable row level security;
alter table product_variants enable row level security;

create policy "public can view published products"
  on products for select to anon, authenticated
  using (status = 'published'::product_status);

create policy "admins manage products"
  on products for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "public can view images of published products"
  on product_images for select to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_images.product_id
        and products.status = 'published'::product_status
    )
  );

create policy "admins manage product_images"
  on product_images for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "public can view variants of published products"
  on product_variants for select to anon, authenticated
  using (
    exists (
      select 1 from products
      where products.id = product_variants.product_id
        and products.status = 'published'::product_status
    )
  );

create policy "admins manage product_variants"
  on product_variants for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ── blog_posts ───────────────────────────────────────────────────────────
alter table blog_posts enable row level security;

create policy "public can view published blog_posts"
  on blog_posts for select to anon, authenticated
  using (status = 'published'::blog_status);

create policy "editors manage blog_posts"
  on blog_posts for all to authenticated
  using (private.has_admin_role('editor'::admin_role))
  with check (private.has_admin_role('editor'::admin_role));

-- ── inquiries ────────────────────────────────────────────────────────────
alter table inquiries enable row level security;

create policy "public can submit inquiries"
  on inquiries for insert to anon, authenticated
  with check (
    product_id is null
    or exists (
      select 1 from products
      where products.id = inquiries.product_id
        and products.status = 'published'::product_status
    )
  ); -- other protected fields are forced to safe values by the guard-insert trigger

create policy "sales can view inquiries"
  on inquiries for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "sales can update inquiries"
  on inquiries for update to authenticated
  using (private.has_admin_role('sales'::admin_role))
  with check (private.has_admin_role('sales'::admin_role));
  -- Any non-admin UPDATE that somehow reaches this point is still rejected
  -- by trg_inquiries_guard_update for the protected fields specifically.

-- ── quote_requests ───────────────────────────────────────────────────────
alter table quote_requests enable row level security;

-- No direct INSERT policy for anon or authenticated. Creation happens
-- exclusively through public.submit_quote_request(), which is SECURITY
-- DEFINER and therefore bypasses RLS for its own internal INSERT (while
-- independently computing buyer_id from auth.uid() — never trusting
-- caller input). This closes the previous design's flaw: anon had no
-- SELECT policy on quote_requests, so a direct-insert flow could never
-- read back the id it just created anyway.

create policy "buyers can view own quote_requests"
  on quote_requests for select to authenticated
  using (buyer_id = auth.uid());

create policy "sales can view quote_requests"
  on quote_requests for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "sales can update quote_requests"
  on quote_requests for update to authenticated
  using (private.has_admin_role('sales'::admin_role))
  with check (private.has_admin_role('sales'::admin_role));

-- ── quote_request_items ──────────────────────────────────────────────────
alter table quote_request_items enable row level security;

-- No INSERT policy for anon or authenticated at all — every row is
-- created exclusively inside public.submit_quote_request() (SECURITY
-- DEFINER, bypasses RLS for its own internal INSERT after validating
-- everything itself). This removes the previous flaw where anon/
-- authenticated could INSERT items directly, including into a guest
-- quote_request they merely guessed the UUID of.

create policy "buyers can view own quote_request_items"
  on quote_request_items for select to authenticated
  using (private.can_access_quote_request(quote_request_id));

create policy "admins can view all quote_request_items"
  on quote_request_items for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "admins manage quote_request_items"
  on quote_request_items for all to authenticated
  using (private.has_admin_role('sales'::admin_role))
  with check (private.has_admin_role('sales'::admin_role));

-- ── samples ──────────────────────────────────────────────────────────────
alter table samples enable row level security;

-- No direct INSERT policy for anon or authenticated at all. Creation
-- happens exclusively through public.submit_sample_request(), which is
-- SECURITY DEFINER and therefore bypasses RLS for its own internal
-- INSERT — while independently validating the product is published,
-- deriving buyer_id from auth.uid(), and verifying quote_request
-- ownership before accepting any linkage.

create policy "buyers can view own samples"
  on samples for select to authenticated
  using (buyer_id = auth.uid());

create policy "sales can view samples"
  on samples for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "sales can update samples"
  on samples for update to authenticated
  using (private.has_admin_role('sales'::admin_role))
  with check (private.has_admin_role('sales'::admin_role));
  -- Lifecycle fields (payment/shipping/tracking/status/assigned_to) are
  -- additionally protected by trg_samples_guard_update and are expected
  -- to be written via admin_update_sample_status(), not raw column writes.

-- ── saved_products ───────────────────────────────────────────────────────
alter table saved_products enable row level security;

create policy "buyers manage own saved_products"
  on saved_products for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

create policy "admins can view saved_products"
  on saved_products for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

-- ── lead_activity_log ────────────────────────────────────────────────────
alter table lead_activity_log enable row level security;

create policy "sales can view lead_activity_log"
  on lead_activity_log for select to authenticated
  using (private.has_admin_role('sales'::admin_role));

create policy "sales can insert lead_activity_log"
  on lead_activity_log for insert to authenticated
  with check (private.has_admin_role('sales'::admin_role));

-- ── lead_scoring_rules ───────────────────────────────────────────────────
alter table lead_scoring_rules enable row level security;

create policy "admins can view lead_scoring_rules"
  on lead_scoring_rules for select to authenticated
  using (private.is_admin());

create policy "super_admins manage lead_scoring_rules"
  on lead_scoring_rules for all to authenticated
  using (private.has_admin_role('super_admin'::admin_role))
  with check (private.has_admin_role('super_admin'::admin_role));

-- ── attribution_events ───────────────────────────────────────────────────
alter table attribution_events enable row level security;

create policy "public can log attribution_events"
  on attribution_events for insert to anon, authenticated
  with check (true);

create policy "admins can view attribution_events"
  on attribution_events for select to authenticated
  using (private.is_admin());

-- ── capi_events / capi_event_log ─────────────────────────────────────────
-- Intentionally NO policies for anon/authenticated. RLS is enabled with
-- zero grants for those roles, so both get a hard default-deny on every
-- operation. Only a service-role (secret-key) client bypasses RLS — and
-- per Module 1's rule, that client doesn't exist yet; it is introduced in
-- Module 7 when the CAPI relay is actually built.
alter table capi_events enable row level security;
alter table capi_event_log enable row level security;

-- ── media_library ────────────────────────────────────────────────────────
alter table media_library enable row level security;

create policy "admins manage media_library"
  on media_library for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ── seo_metadata ─────────────────────────────────────────────────────────
alter table seo_metadata enable row level security;

create policy "public can view seo_metadata"
  on seo_metadata for select to anon, authenticated
  using (true);

create policy "admins manage seo_metadata"
  on seo_metadata for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ── site_settings ────────────────────────────────────────────────────────
alter table site_settings enable row level security;

create policy "public can view site_settings"
  on site_settings for select to anon, authenticated
  using (true);

create policy "super_admins manage site_settings"
  on site_settings for all to authenticated
  using (private.has_admin_role('super_admin'::admin_role))
  with check (private.has_admin_role('super_admin'::admin_role));

-- ── newsletter_subscribers ───────────────────────────────────────────────
alter table newsletter_subscribers enable row level security;

create policy "public can subscribe to newsletter"
  on newsletter_subscribers for insert to anon, authenticated
  with check (true);

create policy "admins can view newsletter_subscribers"
  on newsletter_subscribers for select to authenticated
  using (private.is_admin());
