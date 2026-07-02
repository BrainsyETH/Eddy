-- File: supabase/migrations/00144_gauge_drainage_area.sql
--
-- Support gauge-to-segment flow transfer (audit F11). Today a single gauge's reading
-- is applied to an entire reach with no adjustment for drainage area or tributary
-- inflow. Storing each gauge's contributing drainage area lets us scale discharge by
-- the drainage-area ratio when a segment sits well above/below its anchoring gauge:
--     Q_seg ≈ Q_gauge * (A_seg / A_gauge)^b   (b ≈ 0.8–1.0)
--
-- Populated from the USGS Site Web Service `drain_area_va` field via
-- scripts/fetch-drainage-areas.ts. NULL where unknown (scaling then no-ops).

ALTER TABLE gauge_stations
    ADD COLUMN IF NOT EXISTS drainage_area_sqmi NUMERIC(10,2);

COMMENT ON COLUMN gauge_stations.drainage_area_sqmi IS 'Contributing drainage area at the gauge (sq mi), from USGS drain_area_va. Used for drainage-area discharge scaling to reaches far from the gauge. NULL = unknown (no scaling).';
