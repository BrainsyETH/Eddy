-- supabase/seed.sql
-- Combined seed file for Supabase CLI
-- This file is run automatically when using `supabase db reset`

-- Import all seed files in order
-- Note: This file imports the individual seed files

-- ============================================
-- Rivers (must run first - other tables reference rivers)
-- ============================================
\ir seed/rivers.sql

-- ============================================
-- Gauge Stations (references rivers)
-- ============================================
\ir seed/gauge_stations.sql

-- ============================================
-- Access Points (references rivers)
-- ============================================
\ir seed/access_points.sql
