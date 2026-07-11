-- File: supabase/migrations/00163_embed_widgets_generalize.sql
-- Generalize embed_widgets beyond the location-pinned card.
--
-- The card proved the registration model: a business registers once, gets an
-- unguessable embed_id, and their branding (logo, accent color, own CTA)
-- renders inside the widget. This migration lets every widget use the same
-- registration for co-branding — a "branding-only" row has no pin and no
-- river; it just carries the business identity that widgets fetch via
-- GET /api/embed/widgets/{embed_id} (branding fields only, never the
-- address/location).

ALTER TABLE embed_widgets
    ADD COLUMN IF NOT EXISTS widget_type TEXT NOT NULL DEFAULT 'card',
    -- The partner's own site, used as the "via {business}" backlink target in
    -- co-branded widget footers.
    ADD COLUMN IF NOT EXISTS site_url TEXT;

-- Branding-only rows have no pin: relax the card-era NOT NULLs but keep the
-- invariant that a card row always has its location + river.
ALTER TABLE embed_widgets ALTER COLUMN location DROP NOT NULL;
ALTER TABLE embed_widgets ALTER COLUMN river_id DROP NOT NULL;

ALTER TABLE embed_widgets DROP CONSTRAINT IF EXISTS embed_widgets_card_needs_pin;
ALTER TABLE embed_widgets ADD CONSTRAINT embed_widgets_card_needs_pin
    CHECK (widget_type <> 'card' OR (location IS NOT NULL AND river_id IS NOT NULL));

COMMENT ON COLUMN embed_widgets.widget_type IS '''card'' = location-pinned Floatable From Here card; ''branding'' = branding-only registration used to co-brand any widget via ?e=.';
COMMENT ON COLUMN embed_widgets.site_url IS 'Partner''s own website — the backlink target for the co-branded footer credit.';

-- Structured "Partner with Eddy" submissions ride the existing feedback
-- pipeline under their own type so they can be triaged separately.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_feedback_type_check
    CHECK (feedback_type IN ('inaccurate_data', 'missing_access_point', 'suggestion', 'bug_report', 'other', 'partner'));
COMMENT ON COLUMN feedback.feedback_type IS 'Type of feedback: inaccurate_data, missing_access_point, suggestion, bug_report, other, partner';
