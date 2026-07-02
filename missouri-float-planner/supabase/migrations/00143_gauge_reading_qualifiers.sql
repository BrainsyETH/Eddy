-- File: supabase/migrations/00143_gauge_reading_qualifiers.sql
--
-- Fix (audit F9): USGS instantaneous values carry qualifier codes (e.g. 'P'
-- provisional, 'e' estimated, 'Ice', 'Eqp' equipment malfunction, '***'). The
-- ingest parsed them into a typed field and then dropped them, so provisional and
-- equipment-suspect readings were surfaced identically to approved data.
--
-- Store the qualifier codes so the app can (a) footnote provisional data and
-- (b) loudly flag the abnormal codes that mean the number itself is suspect.

ALTER TABLE gauge_readings
    ADD COLUMN IF NOT EXISTS qualifiers TEXT[];

COMMENT ON COLUMN gauge_readings.qualifiers IS 'USGS qualifier codes for the reading (e.g. {P} provisional, {e} estimated, {Ice}, {Eqp}). Empty/NULL treated as unqualified. P is normal for real-time data; e/Ice/Eqp/*** mean the value is suspect.';
