# River Guide Style & Fact-Checking Runbook

This is the canonical playbook for authoring or revising any **River Guide** blog post (`category = 'River Guides'` in `blog_posts`). The Current River guide is the implemented template; new rivers should mirror its `guide_data` shape (defined in `src/types/blog.ts`) and the rules below.

## Voice rules

Four rules. Every revision has to clear all four.

1. **Specific over generic.** Always: "the Akers gauge (USGS 07064533) is your primary reference," never "check water levels." Always: "first night at Jerktail Landing (mile 47.5) — gravel-bar camp, no fee," never "camp on a gravel bar overnight."
2. **Named over anonymous.** Always: "Jadwin Canoe Rental at Cedargrove," never "an outfitter near Salem." Always: "Cave Spring at mile 21.9 — the flooded cave you can paddle into," never "famous spring where you can paddle into a cave."
3. **Bounded over absolute.** Always: "one of the largest single-outlet springs in the United States," never "the largest spring in the world." Always: "Missouri's deepest spring at 310 ft," never "the deepest in the U.S."
4. **Segment-aware over river-wide.** Always: "the Upper Current floats year-round below Welch Spring; the headwaters above Cedargrove can be bony in late summer," never "the Current is floatable year-round."

## Locked phrasing for high-error claims

Use these strings verbatim. They've been picked over and verified — drift breaks SEO, breaks consistency across rivers, and most importantly is wrong.

| Claim | Locked text |
|---|---|
| Big Spring scope | **"One of the largest single-outlet springs in the United States, with an average daily flow of about 286 million gallons (~470 cfs avg; 1,170 cfs max)."** Never "largest in the world / on Earth / in the U.S." |
| ONSR founding | **"The first national park area created to protect a river system, established by Congress on August 27, 1964 (Public Law 88-492)."** Never "first national park" or "first Wild & Scenic River." |
| Wild & Scenic | The Current is **not** on the National Wild & Scenic Rivers list. Its sister, the **Eleven Point**, is. Don't conflate. |
| Akers Ferry | **The historic two-car river ferry at Akers has been out of service in recent seasons** — plan to drive shuttles around it. Don't claim it's "the last operating" anything without re-verifying current status with NPS. |
| Blue Spring (Current) | **"Missouri's deepest spring at 310 ft (MO #6 by flow, ~90 MGD), near Powder Mill."** Never "deepest in the U.S." Always disambiguate from the Jacks Fork's Blue Spring near Buck Hollow — they're different springs and routinely conflated. |
| Welch Spring flow | **"~78–120 MGD (sources vary)."** Don't pick a single number; the disagreement is real. |
| HP / motor limits | **Do not memorialize specific HP numbers.** Link to nps.gov/ozar/learn/management/laws-and-policies.htm and let NPS be the source of truth. |
| Spring water | **"Even crystal-clear ONSR springs are not certified potable. Carry your own water."** No exceptions. |
| Caves on foot | **Closed to entry on foot to slow White-Nose Syndrome among bats. Paddling into Cave Spring's mouth is allowed; walking in is not.** |
| Wildlife | **"May spot,"** never "will see." Wild horses, hellbenders, river otters, bald eagles all qualify. |

## Fact-checking checklist

Before publishing or significantly revising a River Guide, verify:

- [ ] **Length and terminus** — Wikipedia + MDC watershed inventory.
- [ ] **Class rating per segment** — American Whitewater + MDC.
- [ ] **Spring rankings** — MDC big-springs page only. Outfitter sites disagree.
- [ ] **All access points and order, with mile markers** — `get_river_pois()` in our DB matches what the on-site planner shows; cross-check against floatmissouri.com Mile-by-Mile and missouriscenicrivers.com.
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

The structured payload lives in `blog_posts.guide_data` (JSONB). Shape is enforced in TypeScript at `src/types/blog.ts`. Required fields: `hero`, `intro_html`, `why_different`, `sections`, `springs`, `seasons`, `what_to_bring`, `pro_tips`, `callouts`, `faq`. Optional but recommended for new river guides: `tldr`, `segments` (Upper / Middle / Lower), `regulations`, `drive_times`, `nearby_attractions`, `related_rivers`. Per-section `segment` + `best_for_tags`. Per-spring `rank` + `flow`.

Renderer is `src/components/blog/RiverGuideLayout.tsx`. New optional fields render only when present, so a new river can ship with the minimum required shape and grow into the rest.

## When in doubt

- **Pull from the DB, not from blog memory.** `get_river_pois()` and `river_gauges` are the source of truth for mile markers and thresholds. The DB matches what the on-site planner shows readers; if your guide disagrees with the DB, the guide is wrong.
- **Three sources or none.** A claim that only appears on one outfitter blog isn't a fact.
- **Soften before you delete.** If a beloved claim won't pass fact-check, "may," "one of," or "approximately" is usually closer to the truth and still useful to the reader.
