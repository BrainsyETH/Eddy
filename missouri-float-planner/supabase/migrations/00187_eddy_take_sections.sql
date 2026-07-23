-- Structured decision-oriented Eddy commentary. Legacy summary_text and
-- quote_text remain authoritative for existing cards, embeds, and social use.
ALTER TABLE public.eddy_updates
  ADD COLUMN IF NOT EXISTS take_sections jsonb;

ALTER TABLE public.gauge_updates
  ADD COLUMN IF NOT EXISTS take_sections jsonb;

COMMENT ON COLUMN public.eddy_updates.take_sections IS
  'Optional {bottomLine, why, watchFor} commentary generated with the existing report call.';

COMMENT ON COLUMN public.gauge_updates.take_sections IS
  'Optional {bottomLine, why, watchFor} commentary generated with the existing report call.';
