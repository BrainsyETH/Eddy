-- File: supabase/migrations/00174_create_images_storage_bucket.sql
-- Creates the public 'images' Storage bucket that /api/upload writes to under the
-- community-visuals/ prefix for River Visual photo submissions.
--
-- Background: the storage.objects RLS policies for bucket_id='images' already exist
-- in production, but the bucket itself was never created (an undocumented manual
-- step that never happened), so uploads fail with a generic 500. This migration
-- creates the bucket and (re)codifies its policies idempotently so every
-- environment — prod, branch databases, fresh local setups — reproduces the same
-- Storage configuration.

-- ============================================
-- BUCKET
-- public = true so getPublicUrl() serves objects without auth, matching the
-- /storage/v1/object/public/... render path used by RiverVisualGallery and the
-- existing "Public read access for images" policy below. The app enforces file
-- size (10MB) and MIME (magic-byte) validation in /api/upload, so the bucket
-- keeps the same null limits as the existing 'AP Images' and 'clips' buckets.
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RLS POLICIES on storage.objects (idempotent — mirrors the DO-block pattern in
-- 00085_river_visual_reports.sql). Public read; service-role write. The public
-- upload endpoint uses the service-role client, so these govern access.
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read access for images'
  ) THEN
    CREATE POLICY "Public read access for images" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role can upload images'
  ) THEN
    CREATE POLICY "Service role can upload images" ON storage.objects
      FOR INSERT TO service_role
      WITH CHECK (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role can update images'
  ) THEN
    CREATE POLICY "Service role can update images" ON storage.objects
      FOR UPDATE TO service_role
      USING (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role can delete images'
  ) THEN
    CREATE POLICY "Service role can delete images" ON storage.objects
      FOR DELETE TO service_role
      USING (bucket_id = 'images');
  END IF;
END $$;
