-- Gasconade shipped with a NULL river_note (00145 seed), so Eddy had no gauge
-- note for it and ran on General knowledge only. Fill a concise note ONLY when
-- still missing, so an ingest-dossier-generated note is never clobbered. The
-- full narrative (losing reach, Rockslide Bluff, per-reach gauges) now lives in
-- EDDY_KNOWLEDGE.md; this is the short note surfaced as "Gauge notes".

UPDATE river_characteristics
SET river_note = 'Three reference gauges span the river — Hazelgreen (upper), Jerome (middle, the most-cited float gauge), and Rich Fountain (lower); read the one nearest the put-in. The upper river has a losing reach above Schlict Spring where low water sinks underground, so the Hazelgreen gauge can overstate floatability there.'
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'gasconade')
  AND (river_note IS NULL OR river_note = '');
