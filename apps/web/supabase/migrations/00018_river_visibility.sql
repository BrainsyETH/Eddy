-- File: supabase/migrations/00018_river_visibility.sql
-- Add visibility control for rivers

-- Add active column to rivers table
ALTER TABLE rivers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Set initial active rivers: Current, Eleven Point, Jacks Fork
-- All others default to inactive for now
UPDATE rivers SET active = FALSE WHERE slug NOT IN ('current', 'eleven-point', 'jacks-fork');

-- Ensure the three target rivers are active
UPDATE rivers SET active = TRUE WHERE slug IN ('current', 'eleven-point', 'jacks-fork');

-- Create index for filtering by active status
CREATE INDEX IF NOT EXISTS idx_rivers_active ON rivers(active) WHERE active = TRUE;
