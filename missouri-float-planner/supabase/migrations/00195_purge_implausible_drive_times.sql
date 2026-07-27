-- 00195_purge_implausible_drive_times.sql
-- Evicting shuttle drive times that were never real.
--
-- drive_time_cache stores Mapbox Directions results keyed on an access-point
-- pair. 34 of its 197 rows are nonsense, in two distinct shapes:
--
--   25 rows at 60+ road miles, topping out at Two Rivers -> Powder Mill at
--   1,694 miles with a route_summary of "I 90, I 90 West". Those two access
--   points are eleven river miles apart in Shannon County, Missouri. I-90 does
--   not enter Missouri. The route is to Two Rivers, WISCONSIN.
--
--   9 rows at 0 minutes and 0 miles, which is the shape a failed lookup takes
--   once it has been written back to the cache as though it succeeded.
--
-- ROOT CAUSE, fixed in the same change as this migration: access points with a
-- `directions_override` geocode that free-text string to get a driving
-- endpoint, and geocodeAddress took Mapbox's first result on faith. Its
-- `proximity` parameter is a soft ranking bias, not a filter, and there was no
-- `bbox` behind it — so any place name that also exists elsewhere in the US
-- could win. geocodeAddress now takes the access point's own coordinates and
-- rejects a result more than 25 miles away, falling back to those coordinates.
--
-- THIS RUNS AFTER THAT CODE IS LIVE, which is the whole reason it is a
-- migration rather than a one-off query: deleting these rows before the guard
-- ships just re-fetches the same wrong answers and re-caches them for 30 days.
--
-- Safe to run more than once, and safe to run against a clean table: every row
-- here is a cache entry that the plan endpoint recomputes on demand. 183 of the
-- 197 are already past expires_at anyway; this removes the rest so no reader
-- gets a stale-but-unexpired bad number in the window before it lapses.

delete from public.drive_time_cache
where drive_miles >= 60
   or drive_minutes = 0
   or drive_minutes is null;
