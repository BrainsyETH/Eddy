-- supabase/migrations/00052_recalibrate_huzzah_thresholds.sql
-- Recalibrate Huzzah Creek (Steelville gauge 07017200) thresholds
--
-- Based on observed trip data and stage/discharge pairs:
--   - Documented Low trip at 2.08 ft (41 cfs)
--   - Good trips at 2.75–2.83 ft (135–152 cfs)
--   - ~3.61 ft ≈ 380 cfs (natural breakpoint where current gets pushy)
--   - ~4.13 ft ≈ 613 cfs (unsafe for casual recreation)
--   - Historic peak is 16.8 ft / 33,300 cfs; recreation "flood" is well below that.
--
-- New thresholds (primary unit = ft):
--   Too Low / Avoid    : < 2.2 ft  (< ~60 cfs)   — lots of dragging / walk boats
--   Low / Scrape City  : 2.2–2.6 ft (~60–110 cfs) — doable but slow; shorten mileage
--   Good / Prime       : 2.6–3.6 ft (~110–380 cfs) — the sweet spot
--   High / Caution     : 3.6–4.2 ft (~380–600 cfs) — fast current; strainers get real
--   Flood / Don't      : ≥ 4.2 ft  (≥ ~600 cfs)   — unsafe for casual recreation
--
-- Previous values: too_low=1.5, low=2.0, optimal_min=2.5, optimal_max=4.5, high=6.0, dangerous=8.0

UPDATE river_gauges rg
SET
    -- Primary thresholds (ft)
    level_too_low      = 2.2,
    level_low          = 2.6,
    level_optimal_min  = 2.6,
    level_optimal_max  = 3.6,
    level_high         = 3.6,
    level_dangerous    = 4.2,
    -- Alternate thresholds (cfs) for UI toggle
    alt_level_too_low      = 60,
    alt_level_low          = 110,
    alt_level_optimal_min  = 110,
    alt_level_optimal_max  = 380,
    alt_level_high         = 380,
    alt_level_dangerous    = 600,
    updated_at = now()
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'huzzah'
  AND gs.usgs_site_id = '07017200';
