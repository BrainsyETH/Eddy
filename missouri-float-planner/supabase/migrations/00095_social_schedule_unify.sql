-- Unify weekly reel scheduling into the media_schedule matrix, alongside
-- river_highlight and daily_digest. Each new key is a Mon-Sun map where
-- unset / null = "don't fire on this day" (tri-state for weekly rows).
--
-- The scheduler now uses these entries instead of weekly_forecast.day_of_week
-- / section_guide.day_of_week / weekly_trend.day_of_week (those fields are
-- left in place for backward-compat but ignored).
--
-- Seeded defaults mirror the previous single-day schedule so enabled reels
-- keep firing on the same day.

UPDATE social_config
SET media_schedule = media_schedule
  || jsonb_build_object(
    'weekly_forecast', jsonb_build_object(
      'mon', null, 'tue', null, 'wed', null, 'thu', null,
      'fri', 'video', 'sat', null, 'sun', null
    ),
    'section_guide', jsonb_build_object(
      'mon', null, 'tue', null, 'wed', 'video', 'thu', null,
      'fri', null, 'sat', null, 'sun', null
    ),
    'weekly_trend', jsonb_build_object(
      'mon', null, 'tue', null, 'wed', null, 'thu', null,
      'fri', null, 'sat', null, 'sun', 'video'
    )
  )
WHERE NOT (media_schedule ? 'weekly_forecast');

-- Update the default for new rows too.
ALTER TABLE social_config ALTER COLUMN media_schedule SET DEFAULT jsonb_build_object(
  'river_highlight', jsonb_build_object(
    'mon', 'video', 'tue', 'image', 'wed', 'video',
    'thu', 'image', 'fri', 'video', 'sat', 'image', 'sun', 'image'
  ),
  'daily_digest', jsonb_build_object(
    'mon', 'video', 'tue', 'image', 'wed', 'video',
    'thu', 'image', 'fri', 'video', 'sat', 'image', 'sun', 'image'
  ),
  'weekly_forecast', jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', 'video', 'sat', null, 'sun', null
  ),
  'section_guide', jsonb_build_object(
    'mon', null, 'tue', null, 'wed', 'video', 'thu', null,
    'fri', null, 'sat', null, 'sun', null
  ),
  'weekly_trend', jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', null, 'sat', null, 'sun', 'video'
  )
);
