-- File: supabase/migrations/00176_images_quarantine.sql
-- Quarantine community photo uploads until moderation (audit F15).
--
-- Before this migration, /api/upload wrote community photos straight into the
-- PUBLIC 'images' bucket and returned the public URL immediately — an object
-- was world-readable the instant it was stored, before any moderator saw it.
--
-- New flow:
--   1. /api/upload stores the normalized image in the PRIVATE
--      'images-quarantine' bucket and returns only the storage path.
--   2. The community report row records that path in image_path; image_url
--      stays NULL while the report is pending.
--   3. Admin moderation previews quarantined objects via short-lived signed
--      URLs (service role).
--   4. On verify, the server copies the object into the public 'images'
--      bucket, sets image_url, and deletes the quarantine copy.
--   5. On reject, objects are deleted from both buckets (takedown).

-- ============================================
-- BUCKET: private — no public object URLs exist for quarantined uploads.
-- No storage.objects policies are added on purpose: only the service-role
-- client (which bypasses RLS) reads, signs, copies, and deletes here, so the
-- default deny-all is exactly the intended posture for anon/authenticated.
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images-quarantine', 'images-quarantine', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- community_reports.image_path — quarantine object path for a pending photo.
-- image_url remains the published (public bucket) URL and is only set at
-- moderation time. Rows created before this migration have image_url already
-- public and image_path NULL; the moderation flow handles both shapes.
-- ============================================
ALTER TABLE community_reports
  ADD COLUMN IF NOT EXISTS image_path TEXT;

COMMENT ON COLUMN community_reports.image_path IS
  'Storage path of the not-yet-published photo in the private images-quarantine bucket. Cleared never; image_url being set marks publication.';
