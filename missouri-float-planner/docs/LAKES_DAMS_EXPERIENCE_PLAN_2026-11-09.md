# Eddy Lakes & Dams — Experience Redesign Plan

**Status:** Approved direction with review changes incorporated · 2026-11-09  
**Starting point:** `BrainsyETH/Eddy`, reconcile `claude/epic-goodall-0lnugc` with current `main`. Preserve the merged date-header and three-metric-row work in PR #1762.  
**Pilot:** Truman Lake / Harry S. Truman Dam and Table Rock Lake / Table Rock Dam

## 1. Product direction

Create two linked experiences built on shared lake and dam data.

### Dam page: Operations first

**Existing URL:** `/dams/[damId]`

The dam page answers: What's the dam doing, what's scheduled, and what does that mean for downstream water?

Page order:

1. Photo header with dam name, location and Share. Keep the photo shallow on mobile, with the primary conditions card overlapping its lower edge. Use verified real dam photography or Eddy artwork.
2. **Today's generation:** Current observed release and turbine status lead the card in one compact row (stacked only on the narrowest phones), so the release reading is on the first screen. The existing hourly schedule follows at the full card width, or the availability explanation when no schedule is posted. DOM and visual order agree on phone and desktop.
3. **Conditions:** Lake level and below-dam measurements together, using Eddy icons and clear freshness labels. Display only measurements the source supports.
4. **Operational interpretation:** Eddy's Read, generation forecasts, and patterns where supported, all ahead of the lake preview. Preserve useful existing ordering within this group.
5. **Lake preview:** Compact seven-day trend, a brief lake summary, reviewed launch count, and an "Explore [Lake]" action only once that public lake route is approved.
6. Supporting dam information and sources.

The page must never put a boat-launch directory ahead of generation. Operations-first is capability-aware: retain release information and the existing honest availability explanation for gate-operated dams or dams without a published hourly schedule. Do not create an empty generation panel.

The redesigned condition area and lake preview are limited to the two pilot dams initially. The dam experience has its own explicit release allowlist, separate from lake-page publication. Data collection and backfills never enable the design. The shared photo header and measurement styling now apply to all dam pages (visual direction approved November 12); lake previews still require the existing publication gate. Shared primitives must pass regression checks across all supported capabilities.

### Lake page: Recreation and conditions first

**New URL:** `/lakes/[slug]`

The lake page answers: What's happening on the lake, where can I launch, and what should I know before heading out?

Page order:

1. Real lake photography, title, and controlling dam link.
2. **Lake conditions:** Prominent current level, movement, conservation-pool relationship, and an interactive historical chart.
3. **Boat launches:** Immediately after conditions. Reviewed locations with photos where available, trailer/hand-launch filters, amenities, meaningful cautions, directions, and the established map interaction.
4. **Quick facts and recreation:** Only documented facts and reviewed facilities that add information beyond the launch list. Keep compact facts alongside conditions where space permits; omit empty or duplicate sections.
5. **Dam connection:** Compact card linking to today's generation schedule and downstream conditions.

The two pages link directly to each other without duplicating their full experiences.

---

## 2. Eddy visual design requirements

Use the existing Eddy design language, not a separate theme for lakes.

- **Typography:** Eddy's Fredoka display headings, existing body font and numeric treatment.
- **Palette:** River teal, warm neutral backgrounds, sandbar accents, and sunset coral where appropriate.
- **Icons:** Reuse `EddyIcon` and the iOS-aligned icon assets, particularly `damGauge`, `release`, `waterTemperature`, `boatRamp`, `parking`, `campground`, `facilities`, and `fishery`.
- **Cards:** Use the existing `Card` component and its established panel/framed variants. Avoid excessive nested cards and generic gray pills.
- **Photography:** Real, verified photographs of the correct dam, lake, or access point, with appropriate usage rights. When no suitable image exists, use an intentional branded fallback rather than generated geography.
- **Trends:** Distinguish rising, falling, and unchanged levels with arrows, measured values, and purposeful contrast. Rising water is not automatically a positive condition.
- **Responsive behavior:** Design desktop and mobile intentionally. Prioritize the current conditions and primary actions on narrow screens.

The generated mockup is a visual reference, not a source for factual measurements or geographical imagery.

### Concrete visual contract

- Use the actual shared generation card and hourly chart; retain date headings and remove redundant schedule-title wording.
- Lake level, Below the dam, and Water temperature share a single measurement row when supported. Do not add a fourth measurement for symmetry. Keep any supported inflow and fishery facts quieter and separate. At narrow widths, preserve readable labels and units without overflow.
- Show rising/falling movement using arrows, a signed measured change and its time window. Use Eddy teal/coral purposefully; no green "good" verdict merely because water rose.
- Show a shared observation timestamp once, top right, only when all associated observations share it. Identify different measurement times beside the affected value. Never replace observation time with fetch time. Daily lake reports keep their daily qualifier and cadence-aware stale state.
- Prefer existing quiet panels for measurements and a framed primary chart. No card inside every card, generic placeholder stats, or decorative empty photo space.
- November 12 visual revision: use a wide photo header with overlaid title and a shallow mobile crop; overlap the first conditions card at the lower edge. Keep the complete chart, observations and disclosures intact. Without a verified photo, use the same branded header with Eddy artwork.
- Each visual PR includes annotated desktop and mobile captures identifying section order, spacing, condition-row behavior and data provenance. All links and interactive controls work in that PR.

---

## 3. Implementation phases

### Phase 1 — Protect existing pages and prepare shared components

**Goal:** Establish the correct architecture without disturbing successful dam experiences.

- Reconcile the working branch with current `main`.
- Remove the `lakeLeads` rule that places the entire lake directory above generation when no tailwater relationship exists.
- Preserve current dam URLs, schedules, forecasts, Reads, and existing functionality.
- Keep the lake registry, pool history, review workflow, and approval gates already implemented.
- Split `OnTheLake.tsx` into reusable lake-condition and launch-list components.
- Ensure the dam and lake pages consume the same verified source data rather than maintaining separate readings.
- Keep existing data access server-side and preserve failures as optional content, so a lake database outage cannot break a generation page. Ensure client components do not import the lake database reader through a mixed presentation/data module.
- Retain independently usable operational content while optional lake data is unavailable.

**Exit gate:** Truman and Table Rock dam pages both retain their generation-first layout, with no feature regressions.

### Phase 2 — Rebuild the individual dam page experience

**Goal:** Implement the left-hand mockup.

Primary work:

- Introduce a photo-capable page header using verified imagery and a branded fallback.
- Preserve the complete generation schedule, hourly interactions, and existing visual functionality.
- Consolidate lake level and below-dam conditions into a cohesive, responsive measurement area.
- Present a compact lake preview with a historical sparkline and a clearly labeled link to the lake page.
- Eliminate the oversized launch list and redundant empty-looking "Dam & lake" card.
- Rework supporting information so it doesn't compete with the primary schedule.
- Deduplicate identical observation times and explicitly label source-time exceptions, following the visual contract.
- Keep lake preview links hidden until the corresponding dedicated route is approved.
- Complete accessibility, accurate missing/stale states, and performance validation in this phase.

A stale zero reading must not be presented as current release. "No generation scheduled" and "No water being released" must remain explicitly different concepts.

**Exit gate:** The primary generation chart remains immediately discoverable on desktop and mobile, and the new supporting modules feel consistent with Eddy's existing pages.

### Phase 3 — Build the dedicated lake pages

**Goal:** Implement the right-hand mockup.

Launch `/lakes/truman` and `/lakes/table-rock` as the pilots.

Reuse the existing `LakeLevelChart` model and improve its presentation without changing the underlying calculations. Offer seven-day history first; longer periods should appear only when real history exists.

Build reviewed boat-launch cards using the existing lake-launch data and canonical access-point identity. Each location should have a clear name, supported launch methods, amenities, directions, and any genuinely verified caution.

Include a map/list experience based on Eddy's established map interactions. Don't create a separate mapping system.

Make the controlling dam prominent through a contextual link and a small operational summary, without repeating the full generation console.

**Exit gate:** Each public page renders meaningful real data, offers a working dam connection, and includes at least one reviewed launch. Assess whether those launches actually provide useful access coverage; one launch is a minimum, not proof of a complete directory. Say "N reviewed launches", and explain that coverage is being added. Reviewed location information is not a claim that the ramp is currently open. Missing photography, amenities, or status information must not be fabricated.

Before enabling either public route, verify the migration against the production ledger, the pool-history job and source timestamps, canonical access identities, and the approved launch records. Keep an unpublished pilot out of public navigation and the sitemap. Use authenticated or local fixture previews for visual review, clearly labeled as previews. Once published, a temporary data outage must render an accurate unavailable state, not remove the route. Complete metadata, canonical URLs, accessibility, and working reciprocal links in the same PR as the route.

### Phase 4 — Connect discovery and prepare the rollout

**Goal:** Make the new experience discoverable without disrupting existing search traffic or navigation.

- Keep `/dams` and all individual dam URLs unchanged.
- Add links between corresponding lake and dam pages.
- Introduce lake discovery within Conditions as dedicated lake pages become ready.
- Give each lake a unique title, description, canonical URL, and appropriate internal links.
- Update the sitemap when lake pages are approved for public discovery.
- Avoid duplicating large blocks of dam content onto lake pages.
- Check Google Search Console after release for impressions, clicks, and landing-page behavior on both page types.

Begin with Truman and Table Rock. Expand only after their user experience, data quality, and behavior are validated.

---

## 4. Data and safety requirements

These are release requirements, not optional polish.

**No invented information.** The mockup's photographs, illustrative charts, launch distances, and supplementary numbers must not be copied into production as real data.

**Never confuse observations and plans.** Current observations, historical measurements, posted generation schedules, and forecasts must remain distinguishable.

**Preserve source freshness.** Truman uses a daily lake-level report; Table Rock has an hourly source. Display and stale-data behavior must respect those different cadences.

**Respect ramp verification.** Hide the elevation values themselves and their explanatory footer until threshold review passes. Published elevation thresholds can support cautions only after review, with a sufficiently recent lake level and matching vertical datum. A calculated caution is not an official closure or opening declaration.

**Only show approved launches.** Preserve human approval and existing canonical access-point relationships. Use `/admin/lakes`, or record an explicit owner decision on specified prepared records and methods with its basis and executor in the admin audit (ADR 0019). Agent research supplies proposals, not approval. An agency recreation-area entrance must not become a launch coordinate without verification.

**Migration sequencing matters.** Migration `20261109224918` was applied to production on 2026-11-09. Never reapply its former pending version `20261109210000` based on an old plan. Reconcile its filename and ledger under the project's procedure, stage and review launch records, and validate the pool-history job before depending on that data publicly. Public launch approval and production data changes require their normal review; fixture records are never promoted as evidence.

---

## 5. Engineering scope

Likely primary touchpoints:

| Existing code | Intended change |
|---|---|
| `src/components/dam/DamDetail.tsx` | Restore operations-first hierarchy |
| `src/components/dam/OnTheLake.tsx` | Split oversized presentation into reusable pieces |
| `src/components/dam/DamStateCard.tsx` | Consolidate supporting measurements |
| `src/components/dam/LakeLevelChart.tsx` | Reuse chart with compact and full-size presentations |
| `src/components/ui/EddyIcon.tsx` | Reuse existing symbols; add new roles only if genuinely necessary |
| `src/lib/lakes/*` | Reuse registry, pool history, and reviewed-launch data |
| `src/app/lakes/[slug]/page.tsx` | New dedicated lake page |
| `src/app/dams/[damId]/page.tsx` | Integrate new dam layout without changing its route |
| Conditions navigation / sitemap | Add approved lake destinations |

Favor shared presentation components over duplicate data models, new services, or a broad CSS redesign.

Do not modify iOS, alerts, embeds, national lake coverage, or unrelated river pages in this project. Those remain separate follow-up phases.

---

## 6. Quality gates before merge

Validate both pilot lakes at desktop, tablet, and iPhone widths.

Acceptance criteria:

- Dam generation remains the primary visual and keeps all existing schedule interactions.
- Lake pages emphasize water conditions and launch access.
- All visible photos correspond to their actual locations.
- Eddy's real typography, icons, color tokens, and card components are used throughout.
- No horizontal overflow, clipped charts, tiny unsupported text, or excessive blank cards on mobile.
- Keyboard navigation, touch controls, focus states, chart accessibility, and screen-reader labeling work.
- Missing, stale, and failed data produce accurate messages rather than misleading zeros or false "good" states.
- No duplicate launch identities or contradictory lake levels appear across surfaces.
- Existing dam SEO, canonical URLs, generation data, Reads, and internal links continue to work.
- Compare screenshots of the pilot pages against current production and verify that unrelated dam pages retain their existing layout.
- Exercise a published schedule, an unavailable schedule, a gate-operated dam, missing temperature, missing lake history, a stale zero release, and a failed optional lake-data fetch.
- Regression-check shared embeds and directory cards if any of their shared dependencies change, even though redesigning those surfaces is out of scope.
- Check schedule dates and Today/Tomorrow behavior across Central-time midnight and clock changes.
- Confirm every visible lake link resolves to an approved route; unpublished pilots stay out of public discovery.
- Typecheck, lint, component tests, build, and relevant browser tests pass.
- Any performance regression from hero images, chart code, or new data fetching is addressed before release.

### Recommended delivery structure

**PR 1:** Dam page hierarchy protection and shared component extraction.

**PR 2:** Pilot dam visual redesign, including accessibility, performance, stale/missing-data behavior, and the annotated visual contract. No links to unpublished lake pages.

**PR 3:** Dedicated Truman and Table Rock lake pages, including their metadata, canonical URLs, working reciprocal links, accessibility, and production-data release gates. Local previews may use explicitly labeled fixtures; public rollout waits for approved real content.

**PR 4:** Broader Conditions discovery, sitemap inclusion, and post-release monitoring for approved lake destinations. Validation and accessibility are completed in the PR introducing each feature, not deferred here.

Each PR should include actual before/after screenshots and identify what is live, fixture, or unavailable. No PR should be considered visually complete based only on automated tests.

## 7. Definition of success

A visitor looking for Truman Dam generation finds the schedule immediately.

A visitor looking for Truman Lake levels or boat ramps gets a purpose-built lake experience.

Both recognize Eddy instantly, navigate naturally between the two, and receive consistent, trustworthy conditions.

**The success measure is not how much information fits on the page. It's whether someone can quickly understand the water and decide what to do next.**
