-- Migration: Create feedback table for user-submitted reports
-- Allows users to report inaccurate data, suggest improvements, and submit other feedback

CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Feedback type classification
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('inaccurate_data', 'missing_access_point', 'suggestion', 'bug_report', 'other')),

    -- User contact info
    user_name TEXT,
    user_email TEXT NOT NULL,

    -- The actual feedback
    message TEXT NOT NULL,

    -- Optional screenshot/image URL (for future enhancement)
    image_url TEXT,

    -- Context about what the user was viewing
    context_type TEXT CHECK (context_type IN ('gauge', 'access_point', 'river', 'general')),
    context_id TEXT,           -- ID of the gauge/access point/river
    context_name TEXT,         -- Name for easy reference
    context_data JSONB,        -- Additional context (e.g., gauge readings, coordinates)

    -- Admin review fields
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    admin_notes TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin queries
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX idx_feedback_type ON feedback(feedback_type);
CREATE INDEX idx_feedback_context ON feedback(context_type, context_id);

-- Add comments for documentation
COMMENT ON TABLE feedback IS 'User-submitted feedback and data issue reports';
COMMENT ON COLUMN feedback.feedback_type IS 'Type of feedback: inaccurate_data, missing_access_point, suggestion, bug_report, other';
COMMENT ON COLUMN feedback.context_type IS 'What the user was viewing when submitting: gauge, access_point, river, general';
COMMENT ON COLUMN feedback.context_data IS 'JSON snapshot of relevant data (gauge readings, coordinates, etc.)';
COMMENT ON COLUMN feedback.status IS 'Review status: pending, reviewed, resolved, dismissed';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_feedback_updated_at();

-- RLS policies (allow anonymous inserts, admin-only reads)
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit feedback
CREATE POLICY feedback_insert_policy ON feedback
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Only admins can read feedback
CREATE POLICY feedback_select_policy ON feedback
    FOR SELECT
    TO authenticated
    USING (is_admin());

-- Only admins can update feedback
CREATE POLICY feedback_update_policy ON feedback
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
