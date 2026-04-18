-- Per-post-type per-day-of-week media choice. Replaces the hardcoded
-- "videos on Mon/Wed/Fri, images elsewhere" rule in post-scheduler.ts
-- with an admin-editable matrix.
--
-- Shape:
--   {
--     "river_highlight": { "mon": "video", "tue": "image", ... "sun": "image" },
--     "daily_digest":    { "mon": "video", "tue": "image", ... "sun": "image" }
--   }
--
-- Values: 'video' | 'image'. Missing keys default to 'image' (safe default
-- since images publish inline and don't require a GH Actions render).

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS media_schedule jsonb NOT NULL DEFAULT jsonb_build_object(
    'river_highlight', jsonb_build_object(
      'mon', 'video', 'tue', 'image', 'wed', 'video',
      'thu', 'image', 'fri', 'video', 'sat', 'image', 'sun', 'image'
    ),
    'daily_digest', jsonb_build_object(
      'mon', 'video', 'tue', 'image', 'wed', 'video',
      'thu', 'image', 'fri', 'video', 'sat', 'image', 'sun', 'image'
    )
  );
