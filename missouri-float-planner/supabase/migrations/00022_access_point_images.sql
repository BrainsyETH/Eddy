-- Migration: Add image_urls column to access_points table
-- This allows attaching multiple photos to access points for display in the River Guide

-- Add image_urls column as a text array for multiple images
ALTER TABLE access_points
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Migrate any existing image_url data to image_urls array (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'access_points' AND column_name = 'image_url') THEN
    UPDATE access_points
    SET image_urls = ARRAY[image_url]
    WHERE image_url IS NOT NULL AND image_url != '';

    -- Drop the old column after migration
    ALTER TABLE access_points DROP COLUMN IF EXISTS image_url;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN access_points.image_urls IS 'Array of image URLs for this access point (stored in Supabase Storage or external URLs)';
