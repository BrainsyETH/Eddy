-- File: supabase/migrations/00001_extensions.sql
-- Enable required PostgreSQL extensions

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
