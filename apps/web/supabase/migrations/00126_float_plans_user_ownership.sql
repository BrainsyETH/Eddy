-- File: supabase/migrations/00126_float_plans_user_ownership.sql
-- Adds optional user ownership to float_plans for consumer accounts
-- (web sign-in + the iOS app). Plans remain anonymous and shareable by
-- short_code; signing in lets a user keep a "my saved plans" list.

-- Nullable: existing rows and anonymous saves keep working unchanged.
ALTER TABLE float_plans
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_float_plans_user_id
  ON float_plans(user_id)
  WHERE user_id IS NOT NULL;

-- Tighten INSERT: anonymous creates stay allowed, but a row claiming a
-- user_id must belong to the caller.
DROP POLICY IF EXISTS "Anyone can create float plans" ON float_plans;
CREATE POLICY "Anyone can create float plans"
  ON float_plans FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Owners can remove plans from their saved list.
CREATE POLICY "Users can delete their own float plans"
  ON float_plans FOR DELETE
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- SELECT stays public ("Float plans are viewable by everyone", 00004):
-- plans are shareable by URL. View counts continue to go through
-- increment_plan_view_count() (00035).
