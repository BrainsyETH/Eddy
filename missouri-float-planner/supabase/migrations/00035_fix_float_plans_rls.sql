-- File: supabase/migrations/00035_fix_float_plans_rls.sql
-- Fix: Restrict float_plans UPDATE policy to only allow view_count changes
-- Previously the policy allowed updating ALL columns on ANY float plan

-- Drop the overly-permissive update policy
DROP POLICY IF EXISTS "Anyone can update float plan view count" ON float_plans;

-- Create a secure function to increment view count (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION increment_plan_view_count(p_short_code TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE float_plans
  SET view_count = view_count + 1,
      last_viewed_at = NOW()
  WHERE short_code = p_short_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No UPDATE policy needed — view count is handled via the function above.
-- Admins can still update via service role (which bypasses RLS).
