-- Migration: 00034_access_point_detail_fields.sql
-- Description: Add fields for enhanced access point detail pages
-- Features: Road surface multi-select, parking capacity, managing agency, official links, local tips, nearby services

-- ============================================
-- 1. Add new columns to access_points table
-- ============================================

-- Road surface types (multi-select array)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS road_surface text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.access_points.road_surface IS
'Array of road surface types: paved, gravel_maintained, gravel_unmaintained, dirt, seasonal, 4wd_required';

-- Parking capacity (for quick stats display)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS parking_capacity text;

COMMENT ON COLUMN public.access_points.parking_capacity IS
'Parking capacity: 5, 10, 15, 20, 25, 30, 50+, roadside, limited, unknown';

-- Managing agency (for facilities badge)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS managing_agency text;

COMMENT ON COLUMN public.access_points.managing_agency IS
'Managing agency: MDC, NPS, USFS, COE, State Park, County, Municipal, Private';

-- Official site URL (deep link to specific facility page)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS official_site_url text;

COMMENT ON COLUMN public.access_points.official_site_url IS
'Deep link to the specific official page (e.g., MDC facility page, NPS campground page), not the homepage';

-- Local tips / Eddy tips (rich text HTML)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS local_tips text;

COMMENT ON COLUMN public.access_points.local_tips IS
'Curated local knowledge and tips in HTML format (from TipTap editor). Displayed as Eddy tips with otter icon.';

-- Nearby services (JSONB array of outfitters, campgrounds, etc.)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS nearby_services jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.access_points.nearby_services IS
'Array of nearby services: [{"name": "string", "type": "outfitter|campground|canoe_rental|shuttle|lodging", "phone": "string", "website": "string", "distance": "string", "notes": "string"}]';


-- ============================================
-- 2. Add constraints for enum-like fields
-- ============================================

-- Road surface constraint (validate array values)
ALTER TABLE public.access_points
DROP CONSTRAINT IF EXISTS access_points_road_surface_check;

ALTER TABLE public.access_points
ADD CONSTRAINT access_points_road_surface_check
CHECK (
  road_surface <@ ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required']::text[]
);

-- Managing agency constraint
ALTER TABLE public.access_points
DROP CONSTRAINT IF EXISTS access_points_managing_agency_check;

ALTER TABLE public.access_points
ADD CONSTRAINT access_points_managing_agency_check
CHECK (
  managing_agency IS NULL OR
  managing_agency = ANY(ARRAY['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'])
);

-- Parking capacity constraint
ALTER TABLE public.access_points
DROP CONSTRAINT IF EXISTS access_points_parking_capacity_check;

ALTER TABLE public.access_points
ADD CONSTRAINT access_points_parking_capacity_check
CHECK (
  parking_capacity IS NULL OR
  parking_capacity = ANY(ARRAY['5', '10', '15', '20', '25', '30', '50+', 'roadside', 'limited', 'unknown'])
);


-- ============================================
-- 3. Create index for managing_agency (useful for filtering by agency)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_access_points_managing_agency
ON public.access_points (managing_agency)
WHERE managing_agency IS NOT NULL;


-- ============================================
-- 4. Helper function to validate nearby_services JSONB structure
-- ============================================

CREATE OR REPLACE FUNCTION validate_nearby_services()
RETURNS trigger AS $$
DECLARE
  service jsonb;
  valid_types text[] := ARRAY['outfitter', 'campground', 'canoe_rental', 'shuttle', 'lodging'];
BEGIN
  -- Allow empty array
  IF NEW.nearby_services IS NULL OR NEW.nearby_services = '[]'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Validate each service in the array
  FOR service IN SELECT * FROM jsonb_array_elements(NEW.nearby_services)
  LOOP
    -- Check required 'name' field
    IF NOT (service ? 'name') OR (service->>'name') IS NULL OR (service->>'name') = '' THEN
      RAISE EXCEPTION 'Each nearby service must have a non-empty "name" field';
    END IF;

    -- Check required 'type' field and validate against allowed values
    IF NOT (service ? 'type') THEN
      RAISE EXCEPTION 'Each nearby service must have a "type" field';
    END IF;

    IF NOT ((service->>'type') = ANY(valid_types)) THEN
      RAISE EXCEPTION 'Invalid service type "%". Must be one of: %', service->>'type', array_to_string(valid_types, ', ');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate nearby_services on insert/update
DROP TRIGGER IF EXISTS validate_nearby_services_trigger ON public.access_points;

CREATE TRIGGER validate_nearby_services_trigger
BEFORE INSERT OR UPDATE OF nearby_services ON public.access_points
FOR EACH ROW
EXECUTE FUNCTION validate_nearby_services();


-- ============================================
-- 5. Add comment summarizing all new fields
-- ============================================

COMMENT ON TABLE public.access_points IS
'Access points (put-ins, take-outs, campgrounds) along rivers.
New detail fields added in migration 00034:
- road_surface: Multi-select array of road types for badges
- parking_capacity: Quick stat for parking spaces
- managing_agency: MDC/NPS/USFS/etc badge for facilities section
- official_site_url: Deep link to official government page
- local_tips: Rich text HTML for curated Eddy tips
- nearby_services: JSONB array of outfitters/campgrounds';
