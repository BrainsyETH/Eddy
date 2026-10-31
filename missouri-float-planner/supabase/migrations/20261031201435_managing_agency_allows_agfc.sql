-- managing_agency can name the Arkansas Game and Fish Commission.
--
-- access_points_managing_agency_check (00034) was written for Missouri: MDC,
-- NPS, USFS, COE, State Park, County, Municipal, Private. Eddy now covers
-- Arkansas rivers whose accesses AGFC runs, and those rows have had to leave
-- the column NULL ("AGFC is not in the enum", 00158) while ownership carried
-- the operator as free text. The November 2026 agency-data review found 35
-- AGFC-managed access points it could not record.
--
-- Additive only: every existing value stays valid, so no row can fail the new
-- check. Ownership is still not permission — a manager is who runs the place,
-- not a statement that a launch is open.

ALTER TABLE public.access_points
DROP CONSTRAINT IF EXISTS access_points_managing_agency_check;

ALTER TABLE public.access_points
ADD CONSTRAINT access_points_managing_agency_check
CHECK (
  managing_agency IS NULL OR
  managing_agency = ANY(ARRAY['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private', 'AGFC'])
);
