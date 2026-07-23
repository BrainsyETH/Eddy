-- Adds the compact AI synthesis shown as "Eddy's read" on river reports.
-- Nullable for backward compatibility with existing generated updates.

ALTER TABLE public.eddy_updates
  ADD COLUMN IF NOT EXISTS eddy_read TEXT;

ALTER TABLE public.gauge_updates
  ADD COLUMN IF NOT EXISTS eddy_read TEXT;

COMMENT ON COLUMN public.eddy_updates.eddy_read IS
  'Concise AI-generated river/trend/outlook synthesis produced in the existing report call.';

COMMENT ON COLUMN public.gauge_updates.eddy_read IS
  'Concise AI-generated selected-gauge synthesis produced in the existing report call.';
