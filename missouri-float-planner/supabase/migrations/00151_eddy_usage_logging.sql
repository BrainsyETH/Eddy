-- Adds model + token-usage columns to the Eddy AI cache tables so per-generation
-- spend and prompt-cache hit rates become observable. Populated by the
-- generators from Claude's message.usage; all nullable so historical rows,
-- failures, and non-AI fallbacks are unaffected.
--
-- eddy_updates previously recorded no model at all; gauge_updates already had
-- model_used, so it only gains the token columns.

ALTER TABLE eddy_updates
  ADD COLUMN IF NOT EXISTS model_used            TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens          INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens         INTEGER,
  ADD COLUMN IF NOT EXISTS cache_read_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER;

ALTER TABLE gauge_updates
  ADD COLUMN IF NOT EXISTS input_tokens          INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens         INTEGER,
  ADD COLUMN IF NOT EXISTS cache_read_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER;
