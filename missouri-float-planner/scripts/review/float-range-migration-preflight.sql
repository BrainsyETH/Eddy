-- READ ONLY: verify production schema before deploying the save endpoint.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'float_plans'
AND column_name IN ('estimated_float_min_minutes','estimated_float_max_minutes');
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.float_plans'::regclass
AND conname = 'float_plan_time_range_valid';
-- After migration, require two integer columns and the validated range check.
