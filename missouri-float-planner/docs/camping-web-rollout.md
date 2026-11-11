# Web camping: implementation and rollout

Status: gated implementation; **regional launch is NO-GO** on the measured data below. `CAMPING_WEB_ENABLED` defaults off. Enabling it publishes the hub, the two web availability endpoints, header link and sitemap entry together. All new inventory handling is confined to the flagged web endpoints. Existing iOS code, campsite APIs, campground cards and nightly strips are unchanged.

## Decisions

| Decision | Release 1 |
| --- | --- |
| Result unit | One verified campground place. Group facilities by the overview's existing `place.type:place.id`. Unmapped fallback is `facility:<id>`. Never group by a provider district's facility ID. |
| URL | `/camping?campground=<existing-place-key>&arrival=YYYY-MM-DD&departure=YYYY-MM-DD`; accept `facility=` and `night=` links. Filters/view replace history; campground opens push history. |
| Stay | 1–14 occupied nights, exclusive checkout, inside the existing 90-night horizon. Existing mobile/shared matcher retains its 90-night contract. |
| Filters | River, campground name, confirmed availability; Electric only when at least 95% of catalog sites have a known flag. Tent/RV support exists but stays hidden below that threshold. Selected URL filters remain removable. Types are OR. |
| Cache | Version + arrival + departure. 60-second bounded per-instance memo, 100-entry ceiling; no stale-on-error values. River/name/types filter compact site buckets in the browser. |
| Endpoints | GET `/api/camping/stay` and `/api/camping/sites`, shared 60/min/IP, fail closed on configured limiter failure. Rate limiter executes on cache hits. Free; outside x402. |
| Read budget | Five-second abort shared by all DB requests; ≤200 facilities, ≤5,000 catalog sites, ≤14 nights. Ordered pages of 900; site-night ceiling derived from catalog × nights. Errors return 503 rather than partial totals. |
| Scope deferred | Nearby/radius, No hookup/Walk-in/Group, new untracked-place URL model, dedicated campground pages, overnight route planning, new alerts. |

## Phase 0 evidence — 2026-11-10

Read-only queries against the existing FloatMe production project. No provider polling, schema change or production write.

- 36 enabled campground facilities resolve to **36 distinct existing campground places**; zero unmapped. District-permit loops describe separate campgrounds and remain separate.
- 1,591 catalog sites across six Missouri State Parks facilities and 30 Recreation.gov facilities.
- Electric is known for 1,543/1,591 sites (**97.0%**). The mapper recognizes explicit provider terms (including MO's site-name prefix). It does not infer RV/tent suitability from “standard,” “basic” or “electric.” Tent and RV fail the 95% knowledge threshold.
- All catalog sites remain in the expected inventory. Absence from a newer provider payload does not prove retirement. A per-site night must be fresh (under 72 hours), not future-dated, and match that night's facility observation timestamp.

| Arrival → checkout | Missouri State Parks complete | Recreation.gov complete | All tracked complete |
| --- | ---: | ---: | ---: |
| Nov 13 → Nov 15 | 6/6 | 26/30 | 32/36 (88.9%) |
| Nov 20 → Nov 22 | 6/6 | 23/30 | 29/36 (80.6%) |
| Nov 27 → Nov 29 | 6/6 | 23/30 | 29/36 (80.6%) |
| Dec 4 → Dec 6 | 5/6 | 6/30 | 11/36 (30.6%) |

Completeness means every expected catalog site has every occupied night from the matching fresh observation. It establishes a non-null web stay summary; it does not mean a campsite is reservable. No facility was wholly closed or unreleased in the first three windows. In the last window one wholly closed facility is included above; excluding it leaves 10/35 eligible (28.6%). Missing observations were not excluded as off-season closures.

Nov 13 gaps: Buffalo Point, Red Bluff, Silver Mines and War Eagle. The next two windows also lack complete Erbie, Steel Creek and Tyler Bend. December gaps grow substantially. Per-river readiness and representative operating-season weekends remain unproven; these November/December snapshots cannot establish summer readiness. No regional or river pilot is enabled.

## Behavior and correctness

The new web search and detail loaders begin with a paged site catalog. A campground with 5 reserved sites observed out of 40 catalog sites has 35 unknown sites, so its summary is unknown. Confirmed open sites can still be shown as “At least N” with incomplete coverage.

Stay matching intersects the same site across occupied nights; it never takes the minimum of campground daily totals. Continuation-only nights still follow the canonical matcher. Closed, unreleased, first-come and unknown are distinct. Mixed unavailable reasons say “No sites for the whole stay,” not “Full.” Unknown type metadata blocks a filtered zero if the site remains available/first-come/unresolved; a definitively unavailable site cannot change that zero.

The calendar is explicitly a **nightly observation preview**. It shows recorded positive openings, closed/unreleased codes and unknowns; a zero observed count is labelled “no recorded openings,” never a claim that the campground is full. Whole-stay search is authoritative for a selected stay.

Calendar freshness checks each facility's nightly aggregate, not completeness
against its site catalog. A fresh aggregate with missing site inventory can
therefore show “no recorded openings” while whole-stay search says “Availability
unknown.” A `?` means a section's aggregate is missing or expired.

Filters update local UI state immediately, then synchronize the share URL.
Back/Forward, external URL changes and Clear filters restore the same controls;
an older router update cannot overwrite newer typing or checkbox changes.

### Scope: new web hub only

`web-inventory.ts` and `web-data.ts` are used only by the new web hub and its
flagged `/api/camping/stay` and `/api/camping/sites` endpoints. Both endpoints
share a 60/min/IP budget and a five-second read deadline. The existing
`/api/campsites`, `/api/services`, river services and access-page readers retain
their existing implementation and response behavior. The iOS source and shared
camping modules are unchanged; this web release does not alter an installed
app's cards, nightly strips, unknown toggle or wording.

Details load through `/api/camping/sites` only when opened. Provider links use
existing supported URLs, and exact-site photos retain their provider credits.
The web date controls recompute their 90-night window in Central time, including
when a tab resumes after midnight. This affects only the new web hub.

## Launch checklist

- [ ] At least 90% eligible facilities have complete summaries across four representative operating weekends, overall and in each launched provider/river cohort. Campground rollups must pass too.
- [ ] Each advertised site filter has ≥95% known metadata; a filter's absence is not a zero.
- [ ] p95 cached search ≤1s, uncached ≤3s at a 14-night stay and five concurrent users; ≥100 samples per scenario from the target deployment. Test both the current catalog and the supported maximum: 200 facilities, 5,000 sites, 70,000 site-night rows. Include catalog/metadata requests as well as site-night pages in the five-second deadline.
- [ ] Regional response ≤200 KiB compressed; local filtering p95 ≤200ms.
- [ ] Real provider handoffs verified; desktop/mobile and keyboard journey checks pass.
- [ ] Fixture open/full/closed/unreleased/walk-up/unknown cases pass; no false full/filtered zero.
- [ ] Owner reviews preview and rollout evidence before enabling the flag.

`scripts/camping-live-check.ts` is a read-only probe for an environment with
public Supabase configuration. Its memo timing is not an HTTP endpoint
benchmark. `npm run test:camping-capacity` exercises the real loader with labelled
maximum-size database fixtures, reports page counts, response size and timing
for 100 samples at concurrency five, and optionally models per-page latency via
`CAMPING_FIXTURE_PAGE_MS`. It makes no external requests. Fixture timing cannot
pass the deployment latency gate.

For the deployment gate, use a staging catalog at the maximum above; keep
synthetic inventory out of production. Record cold and warm samples separately,
verify cold reads rather than relying on cache-busting query parameters, and
include all errors/timeouts in the report. Use five actual clients within the
60/min/IP limit. Keep launch latency boxes unchecked until that evidence exists.

## Validation and rollout

`src/lib/camping/web-search.test.ts` covers stay/date bounds, incomplete catalogs, filtered zero uncertainty, continuation nights, mixed status, per-filter gates, freshness and campground identity. `web-route.test.ts` exercises the real route with mocked database responses: flag, validation, cache reuse, limiter, and 503 failures. The web tests cover catalog completeness and paging; existing read/stay tests continue to validate unchanged legacy behavior.

`npm run test:camping-browser` creates a temporary development-only page, tests the real CampingHub at desktop and 390px widths, and removes it. Screenshots are labelled fixtures, never live observations. No credentials are required. It checks immediate checkbox state, rapid typing/caret position, URL state, Back/Forward, Clear filters, whole-stay state, dialog focus/Escape, overflow and the 14-night cap.

Keep `CAMPING_WEB_ENABLED` unset. Run deployment benchmarks and the coverage audit again, then decide on a regional launch or a separately scoped cohort. Rollback: unset the flag; header/sitemap/page/API disappear together. Existing campsite APIs and mobile stay support remain available.

App CI runs capacity and browser fixtures in a separate `camping-web` job and uploads labelled screenshots. It does not add browser steps to the required `lint-and-typecheck` job. These are preview evidence; they do not substitute for live operating-season coverage or deployment latency measurements.

Merge-check policy follows the repository's `CLAUDE.md`: keep dependency-audit
visible but non-required while the reviewed upstream Zod advisory is unresolved.
Do not downgrade dependencies to make that inherited advisory disappear. Record
per-run validation results and unrelated CI failures in the PR, not this runbook.
