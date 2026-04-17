-- Feature-flag column on social_config so new video behaviors can be toggled
-- from the admin UI without code changes. Additive JSONB so future toggles
-- don't need their own columns.
--
-- Current keys:
--   condition_alerts_as_video  — when true, condition-change alerts render
--                                as Reels via GitHub Actions instead of
--                                publishing an image inline.

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS video_features jsonb NOT NULL DEFAULT jsonb_build_object(
    'condition_alerts_as_video', false
  );
