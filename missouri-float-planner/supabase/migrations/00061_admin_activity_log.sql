-- Create admin activity log table for audit trail
CREATE TABLE admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for paginated listing (newest first)
CREATE INDEX idx_admin_activity_log_created_at ON admin_activity_log (created_at DESC);

-- Index for filtering by entity
CREATE INDEX idx_admin_activity_log_entity ON admin_activity_log (entity_type, entity_id);
