-- Add discharge_cfs_at_creation to float_plans table
-- This allows us to show CFS data in social media preview images

ALTER TABLE float_plans
ADD COLUMN discharge_cfs_at_creation NUMERIC(10,2);

COMMENT ON COLUMN float_plans.discharge_cfs_at_creation IS 'Discharge in cubic feet per second at the time the plan was created';
