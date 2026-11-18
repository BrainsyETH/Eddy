-- Reproduce the dated Eddy observation sample. Use USGS site IDs from stations.json.
-- Complete Central days only. Keep raw medians so threshold changes can be replayed.
with daily as (
  select s.usgs_site_id as site,
    (g.reading_timestamp at time zone 'America/Chicago')::date as day,
    percentile_cont(0.5) within group (order by g.discharge_cfs) as cfs
  from public.gauge_readings g
  join public.gauge_stations s on s.id = g.gauge_station_id
  where s.usgs_site_id = any(:sites)
    and g.reading_timestamp >= '2026-01-01 00:00 America/Chicago'::timestamptz
    and g.reading_timestamp < '2026-11-17 00:00 America/Chicago'::timestamptz
    and g.discharge_cfs >= 0
    and not coalesce(g.qualifiers, '{}'::text[]) && array['e','E','Ice','Eqp','Bkw','Mnt','ZFl','***','Dis','Rat','Ssn']
  group by 1, 2
)
select site, json_object_agg(day, cfs order by day) as days from daily group by site;
