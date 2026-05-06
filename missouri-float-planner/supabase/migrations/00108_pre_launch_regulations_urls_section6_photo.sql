-- 00108_pre_launch_regulations_urls_section6_photo.sql
-- Three coordinated content additions to the Current River guide:
--   1) pre_launch_notes — 3 hard-won facts surfaced under TL;DR
--      (trout permits, cell-service warning, shuttle logistics).
--   2) regulations — every entry now carries an authoritative `url` to
--      the relevant nps.gov/ozar page so readers can click through to
--      the official rule.
--   3) sections[id=6].photo — Lower river card was photo-less; add a
--      Float Camp Recreation Area image so it stops looking orphaned
--      next to the other 5 cards.
-- All three are idempotent; safe to re-run.

UPDATE blog_posts
SET guide_data = jsonb_set(
                    (guide_data || $J$
{
  "pre_launch_notes": [
    { "strong": "Trout permits + fly-and-artificial water.",
      "body": "Above Cedargrove is Missouri's Blue Ribbon trout section — a Missouri trout permit is required and only flies/artificial lures are legal. Skip if you don't have the permit." },
    { "strong": "Cell service is spotty inside ONSR.",
      "body": "Plan to be offline once you launch. Download your float plan, the Eddy map, and any directions before you lose bars near Akers." },
    { "strong": "Shuttle: outfitter or two cars.",
      "body": "There's no public ferry. Either rent from an outfitter (they shuttle for you) or stage two vehicles between your put-in and take-out before launching." }
  ],
  "regulations": [
    { "topic": "Glass containers",
      "rule": "Prohibited on the river within ONSR. Glass on the water is a citation, no exceptions.",
      "url": "https://www.nps.gov/ozar/planyourvisit/things2know.htm" },
    { "topic": "Caves & White-Nose Syndrome",
      "rule": "All ONSR caves are closed to entry on foot to slow White-Nose Syndrome among bats. Paddling into Cave Spring's mouth is allowed; walking in is not.",
      "url": "https://www.nps.gov/ozar/learn/nature/caves.htm" },
    { "topic": "Gravel-bar camping",
      "rule": "Free, non-reservable, leave-no-trace on most NPS-managed gravel bars. Some bars are closed seasonally for nesting — signage at access points lists current closures.",
      "url": "https://www.nps.gov/ozar/planyourvisit/camping.htm" },
    { "topic": "Motorboat HP limits",
      "rule": "HP limits change by segment and season and have been updated. Check nps.gov/ozar before launching with a motor — do not rely on memorized numbers from older blog posts.",
      "url": "https://www.nps.gov/ozar/learn/management/laws-and-policies.htm" },
    { "topic": "Alcohol",
      "rule": "Permitted on the river but never in glass. Rangers are active. The Current is a National Park unit — keep it accordingly.",
      "url": "https://www.nps.gov/ozar/planyourvisit/things2know.htm" }
  ]
}
$J$::jsonb),
                    '{sections}',
                    (
                      SELECT jsonb_agg(
                        CASE WHEN s->>'id' = '6'
                             THEN jsonb_set(
                                    s,
                                    '{photo}',
                                    to_jsonb('https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769962223099-Float_Camp_Recreation_Area-K11gteQibEJy52EHcx43M0qTFfbTs4.png'::text)
                                  )
                             ELSE s
                        END
                      )
                      FROM jsonb_array_elements(guide_data->'sections') s
                    )
                 ),
    updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
