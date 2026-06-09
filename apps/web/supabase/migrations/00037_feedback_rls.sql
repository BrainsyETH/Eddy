-- File: supabase/migrations/00037_feedback_rls.sql
-- Ensure feedback table has proper RLS policies

-- Enable RLS (idempotent — safe if already enabled)
ALTER TABLE IF EXISTS feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit feedback
DROP POLICY IF EXISTS "Anyone can submit feedback" ON feedback;
CREATE POLICY "Anyone can submit feedback"
    ON feedback FOR INSERT
    WITH CHECK (true);

-- Only admins can read feedback
DROP POLICY IF EXISTS "Admins can view feedback" ON feedback;
CREATE POLICY "Admins can view feedback"
    ON feedback FOR SELECT
    USING (is_admin());

-- Only admins can update feedback (status, notes)
DROP POLICY IF EXISTS "Admins can manage feedback" ON feedback;
CREATE POLICY "Admins can manage feedback"
    ON feedback FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
