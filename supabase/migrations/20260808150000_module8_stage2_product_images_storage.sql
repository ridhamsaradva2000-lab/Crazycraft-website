-- ============================================================================
-- Module 8 Stage 2 -- product-images Storage bucket + admin-only RLS policies
-- Scope: Storage foundation only. No upload/application code, no Admin UI.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket creation. Single source of truth: this migration. No matching
--    bucket entry exists in supabase/config.toml (confirmed in the Stage 2
--    audit), so no reset/start conflict is possible. Plain INSERT (no
--    ON CONFLICT) so this fails loudly rather than silently no-op'ing if
--    the bucket already exists for any unexpected reason.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10 MiB, in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- ----------------------------------------------------------------------------
-- 2. Admin-only storage.objects policies, scoped strictly to this bucket.
--    RLS is already enabled on storage.objects by Supabase's managed schema;
--    this migration does not alter that.
--
--    No anon or authenticated-non-admin write policy is created anywhere.
--    No anon SELECT policy is created either -- public delivery of a public
--    bucket's objects uses Supabase's normal public object URL path, which
--    does not require a SELECT RLS grant to anon.
-- ----------------------------------------------------------------------------

CREATE POLICY "product_images_admin_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND private.is_admin()
  );

CREATE POLICY "product_images_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND private.is_admin()
  );

CREATE POLICY "product_images_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND private.is_admin()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND private.is_admin()
  );

CREATE POLICY "product_images_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND private.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 3. Future object path convention (documented here, not enforced by RLS).
--
--    <product_uuid>/<server_generated_object_name>.<extension>
--
--    Example shape only:
--    550e8400-e29b-41d4-a716-446655440000/0f81c2a4b3e8.webp
--
--    The filename portion is server-generated/randomized at upload time
--    (a later Module 8 stage). The buyer/admin's raw local filename is
--    never used directly as the Storage object name.
-- ----------------------------------------------------------------------------