-- 00062_social_weekend_boost.sql
-- Add weekend_boost_enabled to social_config

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS weekend_boost_enabled boolean NOT NULL DEFAULT false;
