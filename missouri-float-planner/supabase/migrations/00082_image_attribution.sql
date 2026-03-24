-- Add image_attribution JSONB column to access_points
-- Tracks source, author, license, and source URL for each procured image
-- Format: [{ "url": "...", "source": "wikimedia|mapbox", "author": "...", "license": "CC-BY-SA-4.0", "sourceUrl": "..." }]

ALTER TABLE access_points ADD COLUMN IF NOT EXISTS image_attribution jsonb DEFAULT '[]';
