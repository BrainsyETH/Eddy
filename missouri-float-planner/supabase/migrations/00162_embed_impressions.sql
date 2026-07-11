-- File: supabase/migrations/00162_embed_impressions.sql
-- Privacy-safe impression counts for the embed widgets.
--
-- Widgets fire one beacon per load (POST /api/embed/impression); the API
-- reduces the referrer to a hostname and upserts a daily counter here. One
-- row per (widget, key, host site, day) — no IPs, user agents, or cookies
-- are ever stored, so this stays out of consent-banner territory and the
-- table grows with distinct embedding sites, not with traffic.
--
-- widget_key is the river slug for slug-scoped widgets, the embed_id for
-- registered cards, or 'none' (e.g. the planner with no river preselected).

CREATE TABLE IF NOT EXISTS embed_impressions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    widget_type TEXT NOT NULL,
    widget_key TEXT NOT NULL,
    referrer_host TEXT NOT NULL DEFAULT 'direct',
    theme TEXT,
    partner TEXT,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (widget_type, widget_key, referrer_host, day)
);

CREATE INDEX IF NOT EXISTS idx_embed_impressions_day ON embed_impressions (day);
CREATE INDEX IF NOT EXISTS idx_embed_impressions_host ON embed_impressions (referrer_host);

-- Service-role only, mirroring embed_widgets: the API route writes with the
-- admin client and reporting happens in admin tooling. No public policies.
ALTER TABLE embed_impressions ENABLE ROW LEVEL SECURITY;

-- Upsert-increment for one impression. theme/partner keep the values from the
-- first impression of the day for that (widget, key, host) bucket — they are
-- descriptive labels, not dimensions worth their own rows.
CREATE OR REPLACE FUNCTION log_embed_impression(
    p_widget_type TEXT,
    p_widget_key TEXT,
    p_referrer_host TEXT,
    p_theme TEXT DEFAULT NULL,
    p_partner TEXT DEFAULT NULL
) RETURNS VOID AS $$
    INSERT INTO embed_impressions (widget_type, widget_key, referrer_host, theme, partner)
    VALUES (
        p_widget_type,
        p_widget_key,
        COALESCE(NULLIF(p_referrer_host, ''), 'direct'),
        p_theme,
        p_partner
    )
    ON CONFLICT (widget_type, widget_key, referrer_host, day)
    DO UPDATE SET count = embed_impressions.count + 1;
$$ LANGUAGE sql;

COMMENT ON TABLE embed_impressions IS 'Daily aggregated embed widget impressions per widget/key/host site. Hostname only — no personal data.';
COMMENT ON FUNCTION log_embed_impression IS 'Increment the daily impression counter for an embed widget load. Called by POST /api/embed/impression via the service role.';
