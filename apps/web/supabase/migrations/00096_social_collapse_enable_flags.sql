-- Single source of truth: media_schedule cells control whether posts fire.
-- The legacy master-enable flags (digest_enabled,
-- weekly_forecast.enabled, section_guide.enabled, weekly_trend.enabled)
-- are collapsed into the matrix so the UI has one place to configure
-- scheduling.
--
-- Backfill: where a master-enable flag is false, zero out that post
-- type's matrix cells so the user sees what the scheduler will actually
-- do. The schema columns remain for back-compat but the scheduler no
-- longer reads them.

-- Daily digest
UPDATE social_config
SET media_schedule = jsonb_set(
  media_schedule,
  '{daily_digest}',
  jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', null, 'sat', null, 'sun', null
  )
)
WHERE digest_enabled = false;

-- Weekly Forecast
UPDATE social_config
SET media_schedule = jsonb_set(
  media_schedule,
  '{weekly_forecast}',
  jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', null, 'sat', null, 'sun', null
  )
)
WHERE (weekly_forecast->>'enabled')::boolean IS DISTINCT FROM true;

-- Section Guide
UPDATE social_config
SET media_schedule = jsonb_set(
  media_schedule,
  '{section_guide}',
  jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', null, 'sat', null, 'sun', null
  )
)
WHERE (section_guide->>'enabled')::boolean IS DISTINCT FROM true;

-- Weekly Trend
UPDATE social_config
SET media_schedule = jsonb_set(
  media_schedule,
  '{weekly_trend}',
  jsonb_build_object(
    'mon', null, 'tue', null, 'wed', null, 'thu', null,
    'fri', null, 'sat', null, 'sun', null
  )
)
WHERE (weekly_trend->>'enabled')::boolean IS DISTINCT FROM true;
