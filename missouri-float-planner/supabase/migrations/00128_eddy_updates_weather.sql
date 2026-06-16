-- Persist a compact weather summary alongside each Eddy update.
--
-- Weather (current + 3-day forecast) is already fetched per river by the daily
-- generate-eddy-updates cron, but it was only fed to the LLM prompt and then
-- discarded. Storing a small summary lets social graphics show forecast
-- conditions and lets the Weekend Forecast skip rivers with rain coming —
-- without re-hitting OpenWeather at render time.
--
-- Shape: { current: { tempF, condition, icon } | null,
--          forecast: [{ date, dayOfWeek, highF, lowF, condition, icon, precipChance }],
--          todayPrecipChance: number, maxPrecipChance: number }
-- Null when the weather fetch was unavailable.

alter table public.eddy_updates
  add column if not exists weather jsonb;

comment on column public.eddy_updates.weather is
  'Compact weather summary for social graphics + Weekend Forecast no-rain filter: { current, forecast[<=3], todayPrecipChance, maxPrecipChance }. Null when weather was unavailable. Written by the daily generate-eddy-updates cron.';
