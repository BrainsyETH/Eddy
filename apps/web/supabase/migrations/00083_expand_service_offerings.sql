-- File: supabase/migrations/00083_expand_service_offerings.sql
-- Adds new service_offering enum values for amenities identified in the gap analysis.
-- Each ADD VALUE runs as its own statement (required for enum extension in Postgres).

ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'potable_water';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'fire_rings';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'picnic_tables';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'boat_ramp';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'dump_station';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'flush_toilets';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'vault_toilets';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'laundry';
ALTER TYPE service_offering ADD VALUE IF NOT EXISTS 'playground';
