-- 20260725121500_create_bootstrap_data.sql
--
-- Production-required reference data that the application depends on to
-- function correctly — NOT test/demo data. This runs as a normal migration
-- (applied by `supabase db push` to every environment, including
-- production), unlike seed.sql (which is local/test/demo only and is
-- never automatically applied to a hosted project by `db push`).
--
-- Idempotent via ON CONFLICT DO NOTHING — safe to have already run.

insert into lead_scoring_rules (factor_key, points, description) values
  ('business_email_domain', 15, 'Email is not a known free/disposable domain'),
  ('company_website_provided', 15, 'Company website field filled and well-formed'),
  ('linkedin_provided', 10, 'LinkedIn company page URL provided'),
  ('high_value_business_type', 10, 'Business type is Hotel Buyer, Distributor, or Retail Chain'),
  ('volume_provided', 10, 'Realistic order volume/MOQ familiarity provided'),
  ('target_market_country', 8, 'Country is within a known target export market'),
  ('catalog_download', 5, 'Downloaded a product catalog or spec sheet'),
  ('repeat_visit', 5, 'Additional session from the same visitor_id (capped)'),
  ('rfq_stage_3_completed', 15, 'Completed full 3-stage RFQ, not just Stage 1'),
  ('free_email_no_company_single_page', -20, 'Free email, no company info, single-page session'),
  ('submission_velocity_anomaly', -30, 'Multiple submissions in an implausibly short window')
on conflict (factor_key) do nothing;

insert into categories (slug, name, description) values
  ('blue-pottery', 'Blue Pottery', 'Hand-painted Jaipur blue pottery — vases, tableware, and decorative pieces.'),
  ('wooden-handicrafts', 'Wooden Handicrafts', 'Carved and finished wooden decor, furniture accents, and functional pieces.'),
  ('tote-bags', 'Tote Bags', 'Fabric and jute tote bags for retail and promotional use.'),
  ('bedding-sets', 'Bedding Sets', 'Block-printed and woven bedding for hospitality and retail.'),
  ('home-decor', 'Home Decor', 'General home decor items spanning multiple materials and techniques.')
on conflict (slug) do nothing;

insert into site_settings (key, value) values
  ('company_contact', '{"email": "", "phone": "", "address": ""}'::jsonb),
  ('social_links', '{"linkedin": "", "instagram": ""}'::jsonb)
on conflict (key) do nothing;
