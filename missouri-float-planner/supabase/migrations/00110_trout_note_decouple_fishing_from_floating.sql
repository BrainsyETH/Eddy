-- 00110_trout_note_decouple_fishing_from_floating.sql
-- The pre_launch_notes "Trout permits + fly-and-artificial water" entry
-- was conflating two unrelated things: floating the upper Current (no
-- permit needed) and fishing the upper Current (Missouri trout permit,
-- artificial lures only). The previous body told readers to "skip if
-- you don't have the permit" — that's wrong; you can still float without
-- a fishing permit. Rewrites the note to make the permit explicitly a
-- fishing concern, not a floating concern.
-- Idempotent.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    guide_data,
                    '{pre_launch_notes,0}',
                    $J$
{ "strong": "Trout fishing rules above Cedargrove.",
  "body": "Floating the upper Current doesn't require any permit. If you want to fish there, the section above Cedargrove is Missouri's Blue Ribbon trout water — flies and artificial lures only, and a Missouri trout permit is required." }
$J$::jsonb
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
