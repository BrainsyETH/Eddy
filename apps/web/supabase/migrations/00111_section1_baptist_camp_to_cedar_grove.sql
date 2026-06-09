-- 00111_section1_baptist_camp_to_cedar_grove.sql
-- Two coordinated edits on the Current River guide:
--   1) Section 1 is now Baptist Camp → Cedar Grove (was Montauk →
--      Cedargrove). Baptist Camp at mile 2.1 is the practical put-in
--      for floaters; Tan Vat and Montauk above are tighter / more
--      technical / trout-park rules. The new section is ~7 miles,
--      2–3 hr, Class I–II.
--   2) "Cedargrove" → "Cedar Grove" everywhere in displayed copy
--      (the access-point slug stays `cedargrove`). Done as a single
--      string-replace on the JSONB blob, then the new section 1
--      payload is jsonb_set on top.
-- Idempotent: re-running replaces the same keys.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    jsonb_set(
                       (replace(guide_data::text, 'Cedargrove', 'Cedar Grove'))::jsonb,
                       '{sections,0}',
                       $J$
{
  "id": 1,
  "name": "Trout section",
  "from": "Baptist Camp",
  "to": "Cedar Grove",
  "segment": "upper",
  "miles": "7",
  "time": "2–3 hr",
  "diff": "I–II",
  "crowd": "Quiet",
  "best": "Anglers, paddlers chasing solitude",
  "best_for_tags": ["fly-anglers", "experienced-paddlers", "trout-section"],
  "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
  "body": "Baptist Camp (mile 2.1) is the practical put-in for floaters on the upper Current — Tan Vat (mile 0.9) and Montauk State Park above are tighter, more technical, and Montauk runs as a Blue Ribbon trout park with its own rules. Below Baptist Camp the river still runs cold and clear through rhododendron-lined banks down to Cedar Grove (mile 9). Tidy half-day float; fly fishers and paddlers chasing solitude end up here.",
  "from_slug": "baptist-camp",
  "to_slug": "cedargrove"
}
$J$::jsonb
                    ),
                    '{segments,0,label}',
                    '"Upper Current — Baptist Camp to Akers"'::jsonb
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
