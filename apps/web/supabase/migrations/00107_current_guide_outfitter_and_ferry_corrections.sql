-- 00107_current_guide_outfitter_and_ferry_corrections.sql
-- Two small content corrections after the Field Notebook v2 ship:
--   1) tldr.recommended_outfitter → "Jadwin Canoe Rental" (was "Akers
--      Ferry Canoe Rental"; the user's standing recommendation).
--   2) Section 2 ("The springs run") body softened: Akers Ferry's
--      historic two-car river ferry has been out of service in recent
--      seasons. Older drafts called it "the last operating two-car
--      river ferry in Missouri" which is no longer accurate.
--
-- Idempotent: re-running replaces the same keys.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    jsonb_set(
                       guide_data,
                       '{tldr,recommended_outfitter}',
                       '"Jadwin Canoe Rental"'::jsonb
                    ),
                    '{sections}',
                    (
                      SELECT jsonb_agg(
                        CASE WHEN s->>'id' = '2'
                             THEN jsonb_set(
                                    s,
                                    '{body}',
                                    to_jsonb('Cedargrove (mile 9) puts you straight into bluff country. Pass Cliff Jump (mile 11.8), Medlock Cave & Spring (12.6), and the standout: Welch Spring with its abandoned 1913 hospital ruins at mile 13.7 — pull off river-right and walk up. Take out at Akers Ferry (mile 16.7); the historic two-car river ferry there has been out of service in recent seasons, so plan to drive your shuttle around rather than over it.'::text)
                                  )
                             ELSE s
                        END
                      )
                      FROM jsonb_array_elements(guide_data->'sections') s
                    )
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
