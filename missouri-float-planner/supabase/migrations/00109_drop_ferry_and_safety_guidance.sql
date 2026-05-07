-- 00109_drop_ferry_and_safety_guidance.sql
-- Three editorial corrections:
--   1) Drop every mention of the Akers Ferry's operating status. The
--      historical ferry has been out of service; older drafts said
--      both "still runs" and "out of service in recent seasons" —
--      neither is appropriate for evergreen content. Just say "Akers
--      Ferry" (the access-point name) and leave the ferry alone.
--      Affects: pre_launch_notes[2].body, pro_tips (drop the "Use the
--      ferry" entry), sections[id=2].body.
--   2) The blog should never offer go/no-go guidance ("you're cleared,"
--      "safe to launch"). The "Today on the river" intro copy is in
--      JSX, not in guide_data, so that's handled in the React layout
--      change committed alongside this migration.
-- Idempotent.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    jsonb_set(
                       jsonb_set(
                          guide_data,
                          '{pre_launch_notes}', $J$
[
  { "strong": "Trout permits + fly-and-artificial water.",
    "body": "Above Cedargrove is Missouri's Blue Ribbon trout section — a Missouri trout permit is required and only flies/artificial lures are legal. Skip if you don't have the permit." },
  { "strong": "Cell service is spotty inside ONSR.",
    "body": "Plan to be offline once you launch. Download your float plan, the Eddy map, and any directions before you lose bars near Akers." },
  { "strong": "Shuttle: outfitter or two cars.",
    "body": "Either rent from an outfitter (they shuttle for you) or stage two vehicles between your put-in and take-out before launching." }
]
$J$::jsonb
                       ),
                       '{pro_tips}', $J$
[
  { "strong": "Launch early.",            "body": "Outfitter shuttle bus rolls 8–10 a.m. on summer weekends. Be on the water by 9 and you'll have most of the river to yourself for two hours." },
  { "strong": "Camping etiquette.",       "body": "Gravel bars only, 200 ft from springs and tributaries, no cutting live wood, pack out ash." },
  { "strong": "Don't paddle drunk.",      "body": "Most rescues on this river are alcohol-related. The current is gentle; the cold spring water is not." },
  { "strong": "Phone service is spotty.", "body": "Download your float plan and the Eddy map ahead of time; service generally returns near Van Buren." }
]
$J$::jsonb
                    ),
                    '{sections}',
                    (
                      SELECT jsonb_agg(
                        CASE WHEN s->>'id' = '2'
                             THEN jsonb_set(
                                    s,
                                    '{body}',
                                    to_jsonb('Cedargrove (mile 9) puts you straight into bluff country. Pass Cliff Jump (mile 11.8), Medlock Cave & Spring (12.6), and the standout: Welch Spring with its abandoned 1913 hospital ruins at mile 13.7 — pull off river-right and walk up. Take out at Akers Ferry (mile 16.7).'::text)
                                  )
                             ELSE s
                        END
                      )
                      FROM jsonb_array_elements(guide_data->'sections') s
                    )
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
