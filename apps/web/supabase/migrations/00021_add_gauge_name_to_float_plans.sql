-- Add gauge_name_at_creation to float_plans table
-- This stores the actual gauge name used for the plan, not just the primary gauge

ALTER TABLE float_plans
ADD COLUMN gauge_name_at_creation TEXT;

COMMENT ON COLUMN float_plans.gauge_name_at_creation IS 'Name of the gauge station used at the time the plan was created (segment-aware)';
