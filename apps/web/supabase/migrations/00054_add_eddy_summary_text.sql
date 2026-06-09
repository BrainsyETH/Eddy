-- Add summary_text column for short 1-line Eddy summaries
-- Used by the summary/full toggle on river and gauges pages
ALTER TABLE eddy_updates ADD COLUMN IF NOT EXISTS summary_text TEXT;
