# River Guide Style & Fact-Checking Runbook

> **Status: active** — canonical playbook for authoring River Guide blog posts.

This is the canonical playbook for authoring or revising any **River Guide** blog post (`category = 'River Guides'` in `blog_posts`). The Current River guide is the implemented template; new rivers should mirror its `guide_data` shape (defined in `src/types/blog.ts`) and the rules below.

## Voice rules

Four rules. Every revision has to clear all four.

1. **Specific over generic.** Name the route and the decision: “Cedar Grove to Akers passes Welch Spring; Akers to Pulltite passes Cave Spring.” Avoid interchangeable promises about unforgettable adventures, hidden gems or perfect days.
2. **Useful details earn their space.** Explain what makes a stop interesting or changes the plan. Name a business only when its identity, offering and current relevance are established; the directory is a listing, not a guarantee of availability.
3. **Bound claims to their evidence.** A spring's temperature is not the whole river's temperature. A gauge height is not launch depth. Do not turn historical averages into today's conditions.
4. **Let each river sound like itself.** Distinguish routes, land visits and seasons with concrete details. Keep the invitation to explore; avoid copying the same safety paragraph into every section or labelling every short trip “beginner-friendly.”

## Locked phrasing for high-error claims

These claims need particular care. Verify agency sources before retaining numbers or entry rules; this runbook is not evidence that an older fact remains current.

| Claim | Locked text |
|---|---|
| Big Spring scope | **"One of the largest single-outlet springs in the United States, with an average daily flow of about 286 million gallons (~470 cfs avg; 1,170 cfs max)."** Never "largest in the world / on Earth / in the U.S." |
| ONSR founding | **"The first national park area created to protect a river system, established by Congress on August 27, 1964 (Public Law 88-492)."** Never "first national park" or "first Wild & Scenic River." |
| Wild & Scenic | The Current is **not** on the National Wild & Scenic Rivers list. Its sister, the **Eleven Point**, is. Don't conflate. |
| Akers Ferry | "Akers Ferry" is the access-point name; that's fine to use. **Do not characterize the historical ferry's operating status** — neither "still runs," "the last operating," nor "out of service" — without verifying current status with NPS that day. The cleanest move is to omit it entirely. |
| Cedar Grove | **Two words in display copy** ("Cedar Grove"), one word as a slug (`cedargrove`). The local NPS access point sign uses the two-word form. |
| Go / no-go guidance | **Never tell readers they're "cleared," "good to go," "safe to launch," or "should float."** Eddy is a planning input, not the safety authority. Show data; let the reader decide. Use phrasing like "Eddy reads the gauge and writes a take" — not "if Eddy says float, you're cleared." |
| Blue Spring (Current) | **"Missouri's deepest spring at 310 ft (MO #6 by flow, ~90 MGD), near Powder Mill."** Never "deepest in the U.S." Always disambiguate from the Jacks Fork's Blue Spring near Buck Hollow — they're different springs and routinely conflated. |
| Welch Spring flow | **"~78–120 MGD (sources vary)."** Don't pick a single number; the disagreement is real. |
| HP / motor limits | **Do not memorialize specific HP numbers.** Link to nps.gov/ozar/learn/management/laws-and-policies.htm and let NPS be the source of truth. |
| Spring water | **"Even crystal-clear ONSR springs are not certified potable. Carry your own water."** No exceptions. |
| Cave access | NPS generally restricts cave access but lists exceptions, including Cave Spring, Devils Well and guided Round Spring Cave tours. Check [current floating guidance](https://www.nps.gov/ozar/planyourvisit/floating.htm) and closures; do not repeat the old blanket claim that walking into Cave Spring is prohibited. |
| Wildlife | **"May spot,"** never "will see." Wild horses, hellbenders, river otters, bald eagles all qualify. |

## Fact-checking checklist

Before publishing or significantly revising a River Guide, verify:

- [ ] **Length and terminus** — Wikipedia + MDC watershed inventory.
- [ ] **Class rating per segment** — American Whitewater + MDC.
- [ ] **Spring rankings** — MDC big-springs page only. Outfitter sites disagree.
- [ ] **All access points and order, with mile markers** — `access_points.river_mile_downstream` supplies planner access miles. Use only approved float endpoints in downstream order; `get_river_pois()` supplies scenic POIs, not access points. Cross-check against the land manager’s access guide and regional mile-by-mile references.
- [ ] **All outfitters currently operating** — Phone or check 2025/2026 social posts. Cross-reference missouricanoe.org (MCFA member list).
- [ ] **Regulations cite the entity** — NPS for ONSR, USFS for Eleven Point, MDC for non-federal.
- [ ] **Gauge IDs and floatability thresholds** — USGS Water Data + missouriscenicrivers floatability cutoffs. The `river_gauges` table is the source of truth for thresholds.
- [ ] **Drive times** — Google Maps from STL / KC / Springfield / Memphis (or the regional equivalents that make sense for the river).
- [ ] **Historical claims** — NPS history pages + Wikipedia + MDC magazine archive.
- [ ] **Every superlative** — "largest," "first," "longest," "deepest," "oldest" — needs a primary source. If the source is uncertain, soften to "one of the…" or drop the claim.
- [ ] **Outfitter and lodging operational status** — Some businesses (e.g. The Landing on the Current, which burned in 2021) flip in/out of operation. The on-page `DirectoryCards` already pulls live data; the only place to be careful is `tldr.recommended_outfitter` which is a hardcoded string.

## Authoritative data sources (in order of preference)

1. **MDC** (Missouri Department of Conservation) — springs, rankings, watershed, fish.
2. **NPS / nps.gov/ozar** — ONSR regulations, history, closures.
3. **USFS** (Mark Twain National Forest) — Eleven Point, regs below ONSR section.
4. **USGS Water Data** — gauge IDs, real-time and historical readings.
5. **floatmissouri.com** — Mile-by-Mile guides, section distances.
6. **missouriscenicrivers.com** — floatability cutoffs, outfitter status.
7. **missouricanoe.org** — MCFA outfitter member list.
8. **Wikipedia** — useful for terminus and length cross-references; cite the underlying source where it's the primary.

Outfitter websites and travel blogs (windysfloats.com, dangtravelers.com, unearththevoyage.com, ozarkfloating.com) are tertiary; cross-check before quoting numbers.

## Schema enforcement

The structured payload lives in `blog_posts.guide_data` (JSONB). Shape is enforced in TypeScript at `src/types/blog.ts`. Required fields: `hero`, `intro_html`, `why_different`, `sections`, `springs`, `seasons`, `what_to_bring`, `pro_tips`, `callouts`, `faq`. Optional but recommended for new river guides: `tldr`, `segments` (Upper / Middle / Lower), `regulations`, `drive_times`, `nearby_attractions`, `related_rivers`, `sources` (label + URL). Per-section `segment` + `best_for_tags`. Per-spring `rank` + `flow`.

Renderer is `src/components/blog/RiverGuideLayout.tsx`. New optional fields render only when present, so a new river can ship with the minimum required shape and grow into the rest.

## When in doubt

- **Pull from the DB, not from blog memory.** `access_points.river_mile_downstream` and `river_gauges` are the source of truth for access miles and thresholds; `get_river_pois()` supplies scenic POIs. The DB matches what the on-site planner shows readers; if your guide disagrees with the DB, the guide is wrong.
- **Use the source that owns the fact.** A current agency page can establish a rule. A single outfitter blog cannot establish a river-wide threshold; collect further evidence or omit the claim.
- **Do not hedge an unsupported fact into publication.** “May” and “approximately” do not repair a wrong gauge, invented timing estimate or unverified access. Remove it or clearly identify the actual uncertainty.

## Repository-authored guides and publishing

New missing-river guides live in `scripts/content/river-guides/`, one typed
`RiverGuideSeed` per river, registered in `index.ts`. Keep source URLs and the
editorial check date inside `guide_data.sources` and `guide_data.checked_at`, so
they persist with the article. Use the existing
`guide_data` renderer; do not put a second HTML article in `content`.

The October 2026 batch covers 18 active rivers without a guide. The two Spring
Rivers have separate river slugs and explicitly disambiguated titles. Elk is an
access overview: its known crossing and dam do not have a verified through-route
or portage. Spring River (Missouri) is also an access overview until a second endpoint
with verified launch permission is available. Empty route sections are supported;
never invent a connecting float to fill the template. Photo reuse must be reviewed for the new surface; an existing catalog URL
is not itself permission. See the [photo review](../../docs/river-photo-coverage.md#river-guide-reuse-review-october-2026).

From `missouri-float-planner/`, with the usual script environment loaded:

```sh
npx tsx scripts/seed-river-guides.ts                  # read-only plan
npx tsx scripts/seed-river-guides.ts --apply          # insert new drafts
npx tsx scripts/seed-river-guides.ts --apply --publish # insert new published guides
```

Writes require explicit authorization and the shared `EXPECTED_SUPABASE_REF`
guard. Deploy the updated guide renderer and `/api/blog` first. Review the
preview: it preserves any existing post with the same slug or river, including
drafts and scheduled posts. It rejects missing/inactive rivers, withdrawn
endpoints, reversed routes, and route-mileage drift before inserting anything.
It never overwrites existing articles. If drafts were imported, review and
publish them through `/admin/blog`; rerunning with `--publish` will preserve
those drafts rather than change their status. The article import needs no schema
change. The companion data migration
`20261011203745_river_guide_review_data_corrections.sql` was applied on
**2026-10-11** and is tracked as **applied** in `supabase/production-migrations.txt`: it links the existing Rich Fountain
gauge as secondary/unrated, fixes Kelley’s Slab’s display name without changing
its slug, and retires the obsolete Dawt Mill portage/chute record. Its retirement
is not confirmation of safe navigation today. Production readback verified all
three corrections. The migration filename and ledger match the recorded production version; do not apply the former pending
filename as a separate migration.

The shared heading correction also renders full river names in the seven
existing published guides (for example, “Today on the Current River”). Their
stored article content and permanent URLs are preserved.

Once published, posts appear in the existing web blog. The native app has a
free **Today → River guides** browser and a matching link on each river detail
page. It loads only published posts from `/api/blog`, searches titles and
descriptions, and opens the existing web article in the browser. Evergreen
river guides remain separate from the time-sensitive Eddy’s Reads feed.

## Writing the visible details

- The description, hero lede, and footer do different jobs: search summary,
  invitation to read, and a useful closing tip. Do not repeat one sentence in
  all three places.
- Give each route a distinct audience in `best`. Omit `time`, `crowd`, or `diff`
  when the claim has not been established for that reach; the card supports
  missing fields. Sourced timing estimates must identify their assumptions.
  Keep standard packing essentials, then add gear or logistics specific to the
  river. A beginner tile should name a suitable option to assess, or explain why
  this guide does not provide a first-trip recommendation.
- `springs` can hold genuine land visits under `sights_heading`. Omit `mile` for
  stops that are not located on the float; do not give a trail the launch’s mile
  marker. Access-overview articles can label the section as public access.
- Nearby hazards need a named finish and a useful boundary, without implying
  that an old hazard record is current. A conflicting record needs investigation,
  not an unsupported portage instruction.
- Each source link names the page, not just the agency. Keep references relevant
  to the claims; a gauge page supports gauge identity, not a difficulty rating.
- Store photo attribution in `hero.photo_credit`, bound to its exact `image_url`,
  with author, source, license link, and display alterations. Use owned artwork
  where reuse rights cannot be established. Guide photo captions, creators,
  source links, licenses, and display alterations are collected on
  `/photo-credits`, linked from the website footer and the app's account screen.
  Register each guide photo in `src/lib/photos/guides.ts` so its credit appears
  on that page.
  Article heroes show their caption and exact-image credit inline. Route and sight photos carry their own caption, author, source and license; the shared credits page remains available for catalogued hero images.
  The batch sets `use_access_photos: false` so unresolved access photos cannot
  silently re-enter through the route-card fallback.


## Refreshing existing guides

`reviewed.ts` includes the seven original guides and the eighteen later guides.
`refresh-river-guides.ts` updates existing posts; the insert-only seed script
continues to preserve existing articles.

```sh
npx tsx scripts/refresh-river-guides.ts                 # read-only full before/after preview
npx tsx scripts/refresh-river-guides.ts --river=current # one-river preview
# After reviewing the diff, with the authorized target pinned in the shell:
npx tsx scripts/refresh-river-guides.ts --river=current --apply
```

The refresh validates approved endpoint pairs and mapped mileage before any
write. A content fingerprint must match the reviewed baseline, or already match
the desired content. Any intervening editor change aborts the preflight.
Updates also compare `updated_at` immediately before each write and read the
result back. A later collision stops the batch; already completed rows remain
valid and are skipped on rerun. Save the preview externally before applying so
its `before` fields are available for a reviewed rollback.

Only title, description, structured guide data and read time are updated.
Permanent slugs, publication dates, status and image overrides stay intact.
The detail API exposes structured river articles as `guideData` plus
`articleUrl`; it does not return the stale legacy HTML body for those guides.
General articles keep their existing `content` response.
Deploy the shared renderer and locally hosted photos before applying content
that refers to those assets. Recheck the published pages after the five-minute
cache window. No schema migration or new scheduled job is involved.

`editorial_updated_at` is the substantive copy-edit date used by the visible
byline, Article/OG metadata and sitemap. `checked_at` records a source review;
it is not changed just because wording was edited. Neither is derived from
operational `blog_posts.updated_at`.

The overview uses real `get_float_segment` geometry and omits missing lines.
It shows featured stretches, not a continuous navigable river or a basemap.
Selected stretches are coral/orange, matching the planner. Float times are
requested explicitly from the existing planner; reading a guide does not run
a calculation for every route. Dangerous/regulated responses withhold the
estimate; missing current readings are labelled as planning estimates.

Run `npm run test:guides` for fixture-backed desktop, 390px and 320px checks.
App CI runs it using its existing Chromium installation and uploads the previews.
It exercises the actual guide presentation, map selection, planner estimates,
empty states and search; live condition embeds and planner API responses are
explicit fixtures. No production credentials or writes are needed.

`guide_planner_click` and `guide_access_click` reuse the site's delegated GA4
listener and its production/preview exclusions. Compare page-level Search
Console clicks, impressions and queries over complete date windows after
release; guide filters retain crawlable links and create no new URL variants.
