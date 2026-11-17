-- 20261117041716_clear_ingest_placeholder_river_notes.sql
--
-- Applied to production 2026-11-17 as 20261117041716. Before: 16 rows began
-- with the ingest prefix and 10 held other notes. Read back afterwards: 0 rows
-- begin with the prefix and the same 10 notes remain.
--
-- river_characteristics.river_note is injected into every Eddy's Read prompt
-- as "Gauge notes:". Until 2026-11-17 scripts/ingestion/ingest-dossier.ts
-- filled it with bookkeeping instead of a note:
--
--   Per-section hydro types: wolf-pen-to-redding=undefined,
--   redding-to-turner-bend=undefined, ... River-level default: rain_flashy.
--
-- Read from production on 2026-11-16: 16 of 28 active rivers held a string of
-- that shape, at least 7 of them with `=undefined` for every section.
--
-- The ingest no longer writes the column, and the loader
-- (src/lib/rivers/context.ts, via src/lib/eddy/river-note.ts) drops these
-- strings before a prompt is built. Once that code is deployed this changes
-- no prompt; it was applied ahead of the deploy, so from the next generation
-- the sixteen rivers are handed no note instead of the bookkeeping string.
-- In the stored data the rows stop looking curated when they are not, and the
-- eddy_knowledge trust check's `river_note_malformed` findings for them close.
--
-- Only rows that begin with the ingest's own prefix are touched. A note
-- somebody wrote by hand cannot match it.
--
-- The read-back query; it must return 0.
--   SELECT count(*) FROM river_characteristics
--   WHERE river_note LIKE 'Per-section hydro types:%';

UPDATE river_characteristics
SET river_note = NULL
WHERE river_note LIKE 'Per-section hydro types:%';
