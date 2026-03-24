-- File: supabase/migrations/00082_enhance_nearby_services.sql
-- Adds rich data columns to nearby_services for campground capacity,
-- booking info, fees, season, managing agency, and semi-structured details.

ALTER TABLE nearby_services
  ADD COLUMN IF NOT EXISTS managing_agency TEXT,
  ADD COLUMN IF NOT EXISTS reservation_url TEXT,
  ADD COLUMN IF NOT EXISTS booking_platform TEXT,
  ADD COLUMN IF NOT EXISTS tent_sites INTEGER,
  ADD COLUMN IF NOT EXISTS rv_sites INTEGER,
  ADD COLUMN IF NOT EXISTS cabin_count INTEGER,
  ADD COLUMN IF NOT EXISTS max_guests INTEGER,
  ADD COLUMN IF NOT EXISTS fee_range TEXT,
  ADD COLUMN IF NOT EXISTS season_open_month SMALLINT,
  ADD COLUMN IF NOT EXISTS season_close_month SMALLINT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

-- Comments for documentation
COMMENT ON COLUMN nearby_services.managing_agency IS 'Who manages this site: NPS, MO State Parks, USFS, MDC, County, Private';
COMMENT ON COLUMN nearby_services.reservation_url IS 'Direct booking/reservation URL';
COMMENT ON COLUMN nearby_services.booking_platform IS 'Primary booking platform: recreation_gov, icampmo, fareharbor, resnexus, phone_only, airbnb, hipcamp, campspot, direct_website, other';
COMMENT ON COLUMN nearby_services.tent_sites IS 'Number of tent/primitive campsites';
COMMENT ON COLUMN nearby_services.rv_sites IS 'Number of RV hookup sites';
COMMENT ON COLUMN nearby_services.cabin_count IS 'Number of cabin/lodge units';
COMMENT ON COLUMN nearby_services.max_guests IS 'Maximum total guest capacity';
COMMENT ON COLUMN nearby_services.fee_range IS 'Fee range text, e.g. $10-$30/night';
COMMENT ON COLUMN nearby_services.season_open_month IS 'Month operations begin (1-12), NULL if year-round';
COMMENT ON COLUMN nearby_services.season_close_month IS 'Month operations end (1-12), NULL if year-round';
COMMENT ON COLUMN nearby_services.details IS 'Type-specific structured data: amenities, rules, hookup types, unit details, etc.';

-- Index for filtering by managing agency
CREATE INDEX IF NOT EXISTS idx_nearby_services_managing_agency
  ON nearby_services(managing_agency) WHERE managing_agency IS NOT NULL;
