-- NOT YET APPLIED to production. See the checklist at the bottom.
--
-- Give the Gasconade's primary gauge the bottom of its ladder. Closes
-- `no_too_low_anchor` for river `gasconade`.
--
-- Without level_too_low the badge cannot show "Too Low — Not Recommended" at
-- any flow: the lowest thing it can say is "Low". On a river that genuinely
-- does drop below floatable in a dry August, the bottom rung being absent means
-- the one reading a trip planner most needs is the one the ladder cannot
-- produce.
--
-- ── Where the number comes from ─────────────────────────────────────────
--
-- The method 20260803170000 established: anchor to the gauge's OWN day-of-year
-- percentiles, never to a neighbouring river. Measured from
-- usgs_daily_percentiles for site 06928000 (parameter 00060), over the float
-- season — day-of-year 152 through 258, June 1 to September 15 — across 68
-- years of record:
--
--   p05    68.6 cfs        <- level_too_low anchors here
--   p10    94.1
--   p25   151.8
--   p50   273.7
--   p75   558.6
--
-- level_too_low = 70 cfs, which is p05 rounded to two significant figures. So
-- "Too Low" fires on roughly the driest 5% of summer days, which is what the
-- bottom of the ladder is for.
--
-- ── The line above it is left alone, on purpose ─────────────────────────
--
-- level_low is 100, which sits near this gauge's summer p10 rather than the p25
-- the same method would put it at (152). That is a real gap between the ladder
-- and the method, and it is NOT corrected here: no finding reports it, moving
-- it would change what the badge says across a much wider band of ordinary
-- summer flow, and that is an editorial call about a working ladder rather than
-- a missing anchor. Recorded because the next reader will otherwise notice the
-- inconsistency and assume this migration missed it.
--
-- It also makes 70 the conservative choice. With "Low" already starting at 100,
-- a too_low at p05 keeps a real band between the two rungs instead of stacking
-- them.
--
-- Only the primary gauge is touched. Jerome (06933500) is secondary and carries
-- an optimal_min alone; the rule only asserts against is_primary.

UPDATE river_gauges rg
   SET level_too_low = 70,
       threshold_updated_at = now()
  FROM rivers r, gauge_stations gs
 WHERE rg.river_id = r.id
   AND rg.gauge_station_id = gs.id
   AND r.slug = 'gasconade'
   AND gs.usgs_site_id = '06928000'
   AND rg.is_primary = true;

-- ---------------------------------------------------------------------------
-- Assert the ladder is coherent and the rule is satisfied, in the transaction
-- that changed it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_too_low numeric;
    v_low numeric;
BEGIN
    SELECT rg.level_too_low, rg.level_low
      INTO v_too_low, v_low
      FROM river_gauges rg
      JOIN rivers r ON r.id = rg.river_id
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE r.slug = 'gasconade' AND gs.usgs_site_id = '06928000' AND rg.is_primary = true;

    IF v_too_low IS NULL THEN
        RAISE EXCEPTION 'gasconade primary gauge still has no level_too_low';
    END IF;
    IF v_too_low <> 70 THEN
        RAISE EXCEPTION 'gasconade level_too_low is %, expected 70', v_too_low;
    END IF;
    -- threshold_order is an ERROR-severity rule; trading one finding for
    -- another would not be a fix.
    IF v_low IS NOT NULL AND v_too_low >= v_low THEN
        RAISE EXCEPTION 'gasconade ladder not increasing: too_low % >= low %', v_too_low, v_low;
    END IF;
END $$;

-- After applying, confirm the ledger agrees rather than trusting this file:
--   select * from public.validate_river_data()
--    where river_slug = 'gasconade' and check_name in ('no_too_low_anchor','threshold_order');
