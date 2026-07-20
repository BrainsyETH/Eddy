# Eddy.guide Senior UX, Floater, and Security Audit

**Audit date:** July 19–20, 2026

**Audience:** Founder, product, design, engineering, data, content, and operations

**Scope:** Public Eddy.guide experience, partner widgets, public/admin/API surfaces, Supabase migrations and policies, deployment configuration, dependencies, and GitHub work in progress

**Repository baseline:** `BrainsyETH/Eddy`, local `main` at `a43bae6da2c8f0d1e2e84f89326fa186f33b8a1b`

## Executive summary

Eddy already has the hard-to-copy parts of a useful river product: a distinctive voice, broad Ozark river coverage, current USGS data, a capable map planner, detailed access-point and logistics content, excellent long-form guides, and unusually polished partner widgets. The product feels built by people who understand a float trip rather than by people who merely mapped water.

The largest issue is trust coherence. A floater can see a current gauge number next to an Eddy narrative based on a different number, a card status that conflicts with its trend chart, or a selected map control that resolves to a different take-out. These are not cosmetic defects. They make users question which answer is authoritative at the exact moment Eddy is helping them make a safety and logistics decision.

The security baseline is better than many early-stage products: production admin and callback routes rejected unauthenticated requests; admin bearer tokens expire and are HMAC-verified; public write routes generally validate input and rate-limit; rich text is sanitized on the main write paths; and HSTS, clickjacking, MIME-sniffing, referrer, permissions, and CSP headers are present. The highest-priority security work is to remove public write/delete access from `segment_cache`, upgrade the vulnerable dependency chain led by Next.js 14, align the privacy policy with actual collection, and reduce the blast radius of an admin-side XSS by moving the admin token out of `sessionStorage` and tightening CSP.

No Critical issue was confirmed during this bounded, non-destructive review. Six High issues and a concentrated set of Medium issues should be treated as a near-term trust and safety program, not a redesign wish list.

### Executive scorecard

| Area | Score | What the score means |
|---|---:|---|
| Trip confidence | **5/10** | Rich information is present, but contradictory data and a wrong access-point selection can invalidate the decision. |
| Core UX | **7/10** | Strong journeys and content depth; decision hierarchy and planner feedback need simplification. |
| Mobile | **6/10** | Responsive with no observed horizontal overflow, but map-first layout and multi-second calculation delay obscure the answer. |
| Accessibility | **6/10** | Good semantic foundations, skip link, labeled menus, and proper FAQ disclosure state; several map/action controls lack names and maps need a complete alternative workflow. |
| Performance/resiliency | **6/10** | Cached data endpoints and loading states exist; public pages are often uncached and completed-plan recalculation took about 5.7 seconds in one mobile observation. |
| Data trust | **5/10** | USGS provenance and freshness are visible, but generated narrative, summary counts, status labels, and live readings are not consistently synchronized. |
| Application security | **6/10** | Strong baseline controls; one RLS integrity gap, vulnerable dependencies, weak CSP allowances, and optional/fail-open abuse controls remain. |
| Privacy | **4/10** | The public policy materially understates email, photo, location-adjacent metadata, and third-party processing. |
| Maintainability/operations | **6/10** | Type checking and token validation pass and CI exists; automated tests, dependency gating, observability, and action pinning are limited. |

Scores are directional product-risk indicators, not compliance certifications.

## Evidence model and limitations

Each finding uses one or more evidence labels:

- **LIVE:** reproducible observation in the production browser.
- **HTTP:** safe, non-destructive production request or header check.
- **CODE:** repository source or migration evidence.
- **CHECK:** local command result.
- **EXISTING:** a conclusion already documented in `docs/FLOAT_DATA_ACCURACY_AUDIT.md` and re-scoped here rather than duplicated.
- **VERIFY:** a risk whose production configuration or database state was not available and must be checked before it is called an active exploit.

The audit used ordinary desktop and 390×844 mobile navigation. It did not log in, create records, submit forms, upload files, brute-force, load-test, bypass authorization, or inspect private production data. WCAG observations are expert review findings, not a complete assistive-technology conformance test. Database policies were reviewed from migrations; deployed policy/grant parity remains to be verified. Weather, gauge, road-routing, and access-legality values were not independently surveyed in the field.

## What to preserve

These strengths should be explicit redesign constraints:

1. **USGS source visibility and freshness.** River hubs and plans expose the gauge/source and current-reading context rather than hiding the raw signal.
2. **Safety-forward condition language.** “Dangerous — Do Not Float” is represented in code, and dangerous conditions return no float-time estimate in `src/lib/calculations/floatTime.ts`.
3. **Real floater logistics.** Put-in/take-out selection, river miles, shuttle routing, services, access details, hazards, vessel choice, sharing, and navigation links form a useful end-to-end model.
4. **Outstanding guide content.** The Current River guide has a clear TL;DR, section navigation, route suggestions, springs, outfitters, regulations, seasonal context, packing, nearby activities, and FAQ content.
5. **Broad discovery controls.** River reports support search, state, river type, difficulty, length, status, and sort controls across 24 observed rivers.
6. **Partner experience.** `/embed` provides audience presets, river/theme/widget selection, a working preview, installation code, and multiple widget shapes without requiring partner engineering expertise.
7. **Security headers.** Production sends HSTS, `nosniff`, frame denial for normal pages, strict referrer policy, and restrictive camera/microphone permissions. Widget framing is deliberately separated.
8. **Authentication improvements already made.** Admin tokens are four-hour HMAC tokens with constant-time validation; the legacy indefinitely replayable raw secret path is removed.
9. **Input hygiene on main public writes.** Reports validate UUIDs, coordinate types, ranges, strings, URLs, and gauge ranges. Public images validate both declared MIME and magic bytes. Main rich-text write paths use `sanitize-html`.
10. **Responsive fundamentals.** The tested mobile planner had no horizontal overflow, kept conditions visible, and used a touch-oriented bottom sheet.

## Severity-ranked findings

### F01 — Map control can select the wrong take-out

- **Severity:** High
- **Status:** Confirmed defect
- **Surface/journey:** Planner → map access point → take-out selection
- **Evidence:** **LIVE.** With Montauk State Park selected as put-in, the unique map button announced as “Cedargrove, river mile 9.0, access. Press to select as take-out” was activated. The plan selected **Flying W Access, mile 11.9** and wrote the Flying W identifier to the URL.
- **Impact:** A floater can plan the wrong distance, duration, shuttle, meeting point, and take-out. The accessible name also becomes actively misleading for screen-reader users.
- **Recommended correction:** Give each map feature and control one stable access-point ID; resolve the selected object from that ID only; eliminate index/cluster reuse; assert that accessible name, visible detail, URL ID, and calculated route all refer to the same record.
- **Effort:** 2–4 engineering days including regression coverage.
- **Owner:** Front-end + geospatial engineering; QA.

### F02 — Current readings and Eddy narrative contradict each other

- **Severity:** High
- **Status:** Confirmed defect
- **Surface/journey:** Homepage, river reports, river cards, condition explanations
- **Evidence:** **LIVE.** Big River showed 291 cfs while its Eddy copy referenced 314 cfs; Bryant Creek showed 362 vs 386; Gasconade showed 522 cfs and “rising fast” while the narrative referenced 317 and “steady.” Courtois/Huzzah cards displayed High while a visible trend label read Good.
- **Impact:** Users cannot know whether the number, status, trend, or prose is authoritative. A stale favorable narrative beside a newly high reading is a safety risk and damages confidence across every river.
- **Recommended correction:** Generate the reading, status, trend, freshness, and narrative from one immutable condition snapshot with an `observed_at` and snapshot ID. Suppress narrative when its source snapshot differs from the displayed reading. Add contradiction checks before publish/cache promotion.
- **Effort:** 1–2 weeks.
- **Owner:** Data engineering + application engineering + content.

### F03 — `segment_cache` is publicly writable and deletable in committed RLS

- **Severity:** High
- **Status:** Confirmed in repository; deployed grants/policies require verification
- **Surface/journey:** Supabase data integrity; distance/geometry cache
- **Evidence:** **CODE.** `supabase/migrations/00006_schema_enhancements.sql` says “service role can write” but creates INSERT, UPDATE, and DELETE policies with `WITH CHECK (TRUE)`/`USING (TRUE)`. No later migration revokes those policies or table privileges. `cache_segment()` reads and writes this cache in `00007_segment_aware_functions.sql`.
- **Impact:** If `anon` or `authenticated` retains table privileges in production, anyone with the public Supabase key could poison or delete cached route geometry/distance, corrupting plan results or degrading availability.
- **Recommended correction:** Verify deployed grants immediately. Drop public mutation policies; revoke INSERT/UPDATE/DELETE from `anon` and `authenticated`; permit mutation only through a narrowly scoped server/service path; validate access IDs and computed geometry; log cache invalidation. Consider rebuilding the cache after the change.
- **Effort:** <1 day for policy change; 1–2 days including deployed verification and regression tests.
- **Owner:** Database/security engineering.

### F04 — Production dependency tree contains 20 known runtime advisories

- **Severity:** High
- **Status:** Confirmed repository risk
- **Surface/journey:** Application and supply chain
- **Evidence:** **CHECK.** `npm audit --omit=dev --json` reported **20 production vulnerabilities: 8 High, 12 Moderate, 0 Critical**. The direct application dependency is `next@14.2.35`; advisories also flow through Axios, Hono, Undici, WS, Form-Data, x402/Coinbase packages, and other transitive packages. Full audit reported 24 total. `docs/OBSERVABILITY_AND_UPGRADES.md` already recognizes the Next upgrade need.
- **Impact:** Known framework and request-processing vulnerabilities increase exploitability and emergency-upgrade risk. A large transitive surface also makes it hard to distinguish used production code from dormant packages.
- **Recommended correction:** Upgrade to a supported patched Next major using a regression branch; update/remove vulnerable transitive chains; separate optional chat/payment/social dependencies from the public runtime where possible; add lockfile audit and dependency review gates with an explicit exception process.
- **Effort:** 1–3 weeks depending on Next migration fallout.
- **Owner:** Platform/application engineering.

### F05 — Privacy policy contradicts current data collection

- **Severity:** High
- **Status:** Confirmed defect
- **Surface/journey:** Privacy page, feedback, subscriptions, community reports/photos, analytics
- **Evidence:** **CODE.** `/privacy` states Eddy does not collect name or email and does not collect precise location. The product has feedback and subscription email collection, optional report submitter names, shared plan data, public photo uploads, analytics, and report coordinates. Uploaded JPEGs are stored without re-encoding or EXIF stripping, so camera GPS/device metadata can persist. The inactive chat implementation would send content to Anthropic and persist user/assistant messages and an IP-derived identifier if re-enabled; these processors and retention details are not disclosed.
- **Impact:** Users cannot make an informed choice and the company carries avoidable regulatory, trust, and incident-response exposure. Photo metadata can disclose a location even when the UI does not request GPS.
- **Recommended correction:** Inventory every collection and processor; update the policy with purpose, fields, retention, deletion/contact path, public visibility, processors, international transfer where applicable, and chat terms before chat returns. Strip metadata by server-side decode/re-encode and document photo moderation/removal.
- **Effort:** 3–5 days plus counsel review.
- **Owner:** Product/privacy + legal + engineering.

### F06 — Calibrated trip-time and threshold governance remain incomplete

- **Severity:** High
- **Status:** Existing audit risk; remediation partially confirmed, production data requires verification
- **Surface/journey:** Conditions, float-time estimates, “floatable” recommendations
- **Evidence:** **EXISTING/CODE.** `docs/FLOAT_DATA_ACCURACY_AUDIT.md` documented empty calibrated `float_segments`, editorial threshold risk, and an unsafe flat speed model. Current code now suppresses dangerous-water times, rounds to quarter hours, adds stop overhead, uses asymmetric ranges, and can modulate speed by discharge/reference flow. However it falls back to condition-band speeds whenever reference flow is unavailable. The repository knowledge check could not cross-check active rivers because production Supabase credentials were intentionally absent.
- **Impact:** A polished time range can still imply more certainty than the underlying segment, vessel, stop, obstruction, and flow data supports. Editorial thresholds may classify unfamiliar river regimes incorrectly.
- **Recommended correction:** Treat the existing accuracy audit as the data program of record. Verify production coverage for reference flows, segment calibration, gauge distance, threshold provenance, and last review. Show confidence/coverage in the UI; suppress rather than estimate when minimum inputs fail; field-calibrate the highest-traffic routes first.
- **Effort:** 4–12 weeks, phased.
- **Owner:** Data/product + river subject-matter expert.

### F07 — Shuttle output can be implausible without an integrity warning

- **Severity:** Medium
- **Status:** Confirmed output; route correctness requires external verification
- **Surface/journey:** Completed plan → Shuttle & Logistics
- **Evidence:** **LIVE.** The selected Montauk State Park → Flying W plan showed 11.8 river miles but a **75.34-mile / ~103-minute** shuttle. This may reflect the road network, bad coordinates, reversed endpoints, or routing behavior; the audit did not independently drive the route.
- **Impact:** Users may book the wrong shuttle, miss pickup, or abandon a valid trip. Because the value is precise, it appears verified even when anomalous.
- **Recommended correction:** Add plausibility rules comparing road distance, straight-line distance, river miles, and known access coordinates. Flag outliers as “Verify with outfitter,” show both endpoint names/coordinates before external navigation, and monitor anomalous route ratios.
- **Effort:** 3–5 days.
- **Owner:** Geospatial/data engineering + product.

### F08 — Planner’s mobile answer is delayed and visually subordinate to the map

- **Severity:** Medium
- **Status:** Confirmed UX issue
- **Surface/journey:** Returning mobile user → completed plan/recalculation
- **Evidence:** **LIVE.** At 390×844, a direct completed-plan URL still displayed “Calculating…” after 2.2 seconds and completed around 5.7 seconds in the observed run. The map occupied most of the first viewport while the decisive distance/time/result lived in the bottom sheet. Old lower content remained visible during recalculation.
- **Impact:** On weak river-corridor service, users can mistake old details for current output, wait without useful progress, or never reach the answer. Map-first presentation optimizes exploration over field decision-making.
- **Recommended correction:** On mobile, lead with a compact result/safety sheet and make the map expandable; skeleton or dim all stale dependent values; state what is being calculated; cache the last validated plan locally; provide retry and a text-only fallback.
- **Effort:** 1–2 weeks.
- **Owner:** Product design + front-end engineering.

### F09 — Condition taxonomy and counts are not self-consistent

- **Severity:** Medium
- **Status:** Confirmed defect
- **Surface/journey:** River Reports summary and filters
- **Evidence:** **LIVE.** The page summary said 16 rivers were “looking great,” 3 low, and 5 high. Filters separately showed Floatable now 18, Too Low 3, Low 3, Good 4, Flowing 9, High 5, Flood 0. The relationship among “looking great,” “floatable,” “Good,” and “Flowing” is not explained.
- **Impact:** First-time users cannot translate the system’s categories into a go/no-go decision and may treat “High” as desirable rather than experienced-only.
- **Recommended correction:** Establish one taxonomy and calculation function across summary, filters, cards, charts, widgets, and structured data. Add brief plain-language meanings and make High/Dangerous visually and semantically distinct from positive “good” language.
- **Effort:** 3–7 days.
- **Owner:** Product/content + front-end/data engineering.

### F10 — Decision hierarchy is too dense for a safety-critical scan

- **Severity:** Medium
- **Status:** Confirmed UX issue
- **Surface/journey:** River discovery cards and completed-plan details
- **Evidence:** **LIVE.** Cards combine status, live value, trend, percentile, chart, freshness, descriptive narrative, and actions at similar visual weight. Completed plans present condition, time, access, weather, route POIs, services, shuttle, navigation, and sharing with limited progressive prioritization.
- **Impact:** Users spend cognitive effort reconciling metrics instead of answering: Is this suitable for me, how fresh is the evidence, what could change, and what should I do next?
- **Recommended correction:** Use a stable four-line decision stack: **recommendation → freshness/source → trip fit/uncertainty → action**. Move percentiles/charts and secondary services into disclosure. Put hazards, heat/storm risk, closures, and access legality above social/share actions.
- **Effort:** 1–2 weeks.
- **Owner:** Product design + content.

### F11 — Several interactive controls lack a complete accessible name/alternative

- **Severity:** Medium
- **Status:** Confirmed defect with additional conformance testing required
- **Surface/journey:** Planner map/access details, external navigation, dynamic updates, map alternatives
- **Evidence:** **LIVE.** Several desktop icon-only action buttons had neither visible text nor an `aria-label`. The wrong Cedargrove/Flying W selection also proves the accessible map label can diverge from the action. The 404 had no H1. **CODE** confirms positive patterns in FAQ (`aria-expanded`, `aria-controls`, region) and the mobile menu, so those should not be regressed.
- **Impact:** Screen-reader and voice-control users cannot identify actions reliably. Map-only selection also creates a motor/vision barrier if the alternative list is not feature-equivalent.
- **Recommended correction:** Name every icon control; make the access-point list able to complete the entire trip without the map; announce loading/error/result changes in an appropriate live region; test dialog focus return, escape behavior, keyboard map bypass, target sizes, contrast, and 200% zoom against WCAG 2.2 AA.
- **Effort:** 1–3 weeks including manual AT testing.
- **Owner:** Front-end + accessibility QA + design.

### F12 — Admin session design magnifies any same-origin XSS

- **Severity:** Medium
- **Status:** Confirmed design risk
- **Surface/journey:** Admin authentication and rich-content administration
- **Evidence:** **CODE/HTTP.** Admin tokens live in `sessionStorage` (`src/hooks/useAdminAuth.ts`). Production CSP allows both `'unsafe-inline'` and `'unsafe-eval'`. Admin content includes rich text and multiple `dangerouslySetInnerHTML` sinks; main rich-text write paths sanitize content, which is a meaningful control, but JSON-LD serialization is not explicitly escaped for `<`/`</script>` context. Normal pages deny framing.
- **Impact:** A stored or dependency-supplied script running on the origin can read the admin bearer token for up to four hours and invoke privileged APIs.
- **Recommended correction:** Move admin sessions to `HttpOnly`, `Secure`, `SameSite=Strict` cookies or a managed identity provider with role claims and CSRF protection. Replace inline/eval allowances with nonce/hash-based CSP; add `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'`. Escape `<` in JSON-LD serialization and centralize the helper.
- **Effort:** 1–3 weeks.
- **Owner:** Security/application engineering.

### F13 — Callback protection is fail-open when `CRON_SECRET` is absent

- **Severity:** Medium
- **Status:** Confirmed code defect; production currently failed closed
- **Surface/journey:** `/api/admin/clips/callback`
- **Evidence:** **CODE.** The route rejects a bad bearer only when `cronSecret` is truthy: `if (cronSecret && auth !== ...)`. With a missing environment variable, any caller is accepted. **HTTP.** Production returned 401, proving the current environment is configured. The social video callback correctly uses `if (!cronSecret || ...)`.
- **Impact:** A deployment, preview, or future copy with missing configuration silently becomes public. Today the route only acknowledges/logs results, but its privileged namespace and likely future persistence make the pattern dangerous.
- **Recommended correction:** Fail closed when the secret is missing, share one constant-time machine-auth helper across cron/callback routes, validate schemas, and add a test that unconfigured environments reject.
- **Effort:** <1 day.
- **Owner:** Back-end/security engineering.

### F14 — Abuse controls are optional and fail open

- **Severity:** Medium
- **Status:** Production configuration requires verification
- **Surface/journey:** Login, feedback, subscription, reports, uploads, future chat
- **Evidence:** **CODE.** `src/lib/rate-limit.ts` uses global Upstash only when both environment variables exist, otherwise a per-instance in-memory map. Redis errors allow requests. The client key trusts the first `x-forwarded-for` value. Public writes use service-role access in several routes.
- **Impact:** Without correctly configured trusted-proxy/global limiting, attackers can fan out across serverless instances, spoof keys in some environments, generate storage/moderation cost, or pressure login and notification workflows.
- **Recommended correction:** Verify production Upstash configuration and trusted proxy behavior; publish per-route limits; fail closed or degrade more strictly for costly/storage/auth endpoints; add CAPTCHA or proof-of-work only after behavioral thresholds; enforce storage quotas and lifecycle deletion.
- **Effort:** 3–7 days.
- **Owner:** Platform/security engineering.

### F15 — Public upload error handling and media privacy are incomplete

- **Severity:** Medium
- **Status:** Confirmed defect/risk
- **Surface/journey:** Community image upload
- **Evidence:** **HTTP.** An empty `POST /api/upload` returned 500 rather than a validation 400. **CODE.** `request.formData()` errors fall into the generic 500 handler. Accepted JPEG/PNG/WebP/GIF files are signature-checked and size-limited, but are stored in a public bucket without decode/re-encode, metadata stripping, pixel-dimension/decompression checks, or moderation state at upload time.
- **Impact:** Malformed clients pollute error monitoring; oversized pixel dimensions can create processing risk; EXIF may reveal private locations; public URLs complicate takedown and moderation.
- **Recommended correction:** Reject missing/invalid multipart content as 400/415; decode with a bounded image library, cap pixel area, rotate and re-encode, strip metadata, create thumbnails, quarantine until report moderation, and apply retention/removal controls.
- **Effort:** 3–7 days.
- **Owner:** Back-end/security + privacy.

### F16 — Multi-state expansion is blocked by Missouri-only report bounds

- **Severity:** Medium
- **Status:** Confirmed code/product mismatch
- **Surface/journey:** Arkansas river community reports and future expansion
- **Evidence:** **LIVE/CODE.** River Reports includes Arkansas rivers such as the Caddo. `src/app/api/reports/route.ts` rejects latitude below 35 and says coordinates must be within Missouri.
- **Impact:** Users can browse supported out-of-state rivers but cannot submit valid reports at southern access points, creating invisible coverage bias and broken trust.
- **Recommended correction:** Validate against the selected river corridor or supported-state polygon rather than one rectangular Missouri buffer. Keep server validation and return a river-specific error.
- **Effort:** 2–4 days.
- **Owner:** Geospatial/back-end engineering.

### F17 — Public page caching and API error caching are not intentional enough

- **Severity:** Medium
- **Status:** Confirmed configuration behavior
- **Surface/journey:** Homepage performance, admin/API responses
- **Evidence:** **HTTP.** Homepage responses were `private, no-cache, no-store` and a Vercel miss, despite largely public content. The statewide USGS endpoint was a Vercel hit. Admin 401/400 responses and public validation errors were marked `public, max-age=0, must-revalidate`, not explicit `no-store`.
- **Impact:** Public pages incur avoidable origin/render work and feel slower in weak coverage; auth/error responses rely on intermediary revalidation semantics rather than an explicit sensitive-response policy.
- **Recommended correction:** Separate public data reads from session-dependent middleware; use safe revalidation/ISR and stale-if-error for public shells; explicitly mark admin/auth/private responses `no-store`; document the cache matrix and test it in CI.
- **Effort:** 3–7 days.
- **Owner:** Platform/application engineering.

### F18 — Failed, stale, and offline field states are not yet first-class

- **Severity:** Medium
- **Status:** UX risk; requires scripted failure testing
- **Surface/journey:** Mobile conditions and planning in river corridors
- **Evidence:** **LIVE.** Loading indicators exist, but the mobile completed plan retained old lower content while recalculating. No clear offline plan package, last-known snapshot contract, or text-only field mode was observed in the principal journeys.
- **Impact:** River corridors are exactly where connectivity is weak. A stale screen can be mistaken for a fresh safety recommendation unless stale/unknown states are visually dominant and action-limiting.
- **Recommended correction:** Define one fail-safe state machine for live, aging, stale, unavailable, contradictory, and dangerous data. Persist a timestamped trip card with source links, access coordinates, emergency notes, and “not current” labeling. Never use green/positive recommendation language for unknown or contradictory inputs.
- **Effort:** 2–4 weeks.
- **Owner:** Product design + front-end/data engineering.

### F19 — Observability and automated regression coverage do not match product risk

- **Severity:** Medium
- **Status:** Confirmed maintainability gap
- **Surface/journey:** CI, production detection, trip/data integrity
- **Evidence:** **CHECK/CODE.** Type checking passed. `next lint` produced warnings for raw images and missing hook dependencies; design-token validation passed. There is no unit/integration test script in `package.json`. App CI runs install, typecheck, and lint only. `src/lib/logger.ts` provides a future sink, but no Sentry/Datadog-style sink is configured in code. GitHub Actions use mutable major tags such as `actions/checkout@v4` rather than commit SHAs.
- **Impact:** A defect like Cedargrove selecting Flying W can ship without detection; condition contradictions and failed cron/data refresh can persist until a user notices. Mutable action tags add supply-chain exposure.
- **Recommended correction:** Add focused tests for ID selection, condition snapshot consistency, dangerous/stale suppression, auth matrix, RLS policies, upload validation, and share-plan hydration. Wire error/performance/data-freshness monitoring with redaction and alerts. Pin third-party actions by commit SHA and use Dependabot/Renovate for updates.
- **Effort:** 2–4 weeks for a useful first layer.
- **Owner:** Engineering + QA/security.

### F20 — Recovery and secondary utility pages need small semantic improvements

- **Severity:** Low
- **Status:** Confirmed UX/accessibility issue
- **Surface/journey:** 404 and widget workbench
- **Evidence:** **LIVE.** The 404 uses an H2 as its top heading and only offers “Go Home,” not River Reports or Plan a Float. The widget workbench is comprehensive but its preview initially exposes a generic Loading state; embedded semantics should be tested independently from the host workbench.
- **Impact:** Users following old shared links face a dead end, and assistive technology receives a weaker page outline.
- **Recommended correction:** Use one H1; preserve the attempted path for diagnostics; offer River Reports, Plan a Float, and search. Give widget previews explicit loading/error/last-updated behavior and include widget accessibility in partner acceptance tests.
- **Effort:** 1–2 days.
- **Owner:** Front-end + content.

## Confirmed controls and safe production checks

The following checks passed and should become regression tests:

- `GET /api/health` returned 200 with a minimal response.
- Unauthenticated `GET /api/admin/stats` returned 401.
- Unauthenticated posts to both admin callback endpoints returned 401 in production.
- Empty admin login and feedback JSON returned bounded 400 responses.
- Cross-origin preflight to feedback returned no `Access-Control-Allow-Origin` for an untrusted origin.
- Normal pages deny framing; the widget route deliberately permits framing.
- Normal pages send HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy, and restricted device permissions.
- TypeScript check passed; design-token validation passed; the repository knowledge file check passed. Its production river cross-check was intentionally skipped without credentials.
- No obvious private-key, AWS access-key, Stripe live-key, or GitHub personal-token pattern was found in tracked files by the bounded pattern scan. This is not a substitute for repository secret scanning.
- GitHub had one open PR (#920, ClipEngine stdin/`GH_REPO` workflow reliability) and no open issues. It does not duplicate these recommendations.

## 30/60/90-day backlog

### First 30 days — stop trust and security regressions

| Priority | Work | Outcome |
|---:|---|---|
| P0 | Fix map feature identity and add Cedargrove/Flying W regression coverage. | A selected control can never resolve to another access point. |
| P0 | Make all condition surfaces consume one versioned snapshot; suppress mismatched narrative. | No live number/status/prose contradiction ships. |
| P0 | Verify deployed `segment_cache` grants, remove public mutation, rebuild/validate cache. | Anonymous users cannot poison route geometry or distance. |
| P0 | Begin supported Next/runtime dependency upgrade; isolate or remove unused vulnerable packages. | No known High runtime advisory without a documented, time-bounded exception. |
| P0 | Correct privacy policy and strip photo metadata; add removal/contact process. | Public promises match actual collection and processing. |
| P1 | Add anomalous shuttle checks and “verify” treatment. | Implausible routes are never presented as ordinary precise facts. |
| P1 | Make callback auth fail closed; verify Upstash/trusted-proxy configuration. | Missing secrets and limiter outages do not silently expose costly/privileged routes. |
| P1 | Return 400/415 for malformed uploads and add pixel/metadata controls. | Invalid input is safe, observable, and non-public. |
| P1 | Name all planner icon controls; fix 404 H1 and recovery links. | Immediate keyboard/screen-reader blockers are removed. |
| P1 | Establish contradiction, freshness, cron failure, and planner error alerts. | The team learns about trust failures before users do. |

### By 60 days — simplify decisions and strengthen resiliency

- Redesign river cards and completed plans around recommendation, freshness/source, fit/uncertainty, and action.
- Deliver a text/list-equivalent planner and complete WCAG 2.2 AA keyboard, screen-reader, zoom, target-size, and contrast testing.
- Make loading, recalculating, stale, failed, contradictory, unknown, high, and dangerous states one shared state machine.
- Move admin auth to HttpOnly sessions/managed identity and deploy nonce/hash CSP with explicit `object-src`, `base-uri`, and `form-action` restrictions.
- Define a cache policy for public pages, public APIs, widgets, and sensitive responses; add stale-if-error where safe.
- Validate community reports against each river corridor and support all published states.
- Add field-focused automated tests for access identity, condition consistency, time suppression, RLS, auth, uploads, and shared plans.
- Add privacy-aware error/performance monitoring, data-quality dashboards, retention, and redaction rules.

### By 90 days — build a defensible field and partner platform

- Complete the float-data accuracy program: field calibration, threshold provenance, review cadence, gauge-distance confidence, and segment coverage.
- Offer an offline/low-bandwidth trip card with immutable timestamp, source, access coordinates, hazards, shuttle contacts, and emergency guidance.
- Rework discovery IA around user fit: experience, vessel, desired duration, group needs, drive time, legal access, current risk, and confidence—not only river metrics.
- Add optional privacy-preserving favorites/recent plans and “what changed since last time” for returning users.
- Create a data-governance model: owner, source, review date, confidence, automated validation, incident path, and correction history for every safety-relevant field.
- Version widgets and publish a partner accessibility/performance contract, fallback behavior, status page, and deprecation policy.
- Reduce service-role surface and split optional social/chat/payment/media workloads from the public application runtime.
- Pin GitHub Actions by SHA, adopt automated dependency PRs, generate an SBOM, and review workflow permissions/inputs as code.

## Ten highest-leverage actions and acceptance criteria

1. **Guarantee access-point identity end to end.**

   **Acceptance:** An automated matrix activates every visible/list/map access control on at least the top five rivers and asserts the same ID/name/mile in the accessible name, detail panel, URL, route calculation, share payload, and shuttle endpoints; zero mismatches.

2. **Create one condition snapshot contract.**

   **Acceptance:** Number, unit, status, trend, prose, source, and freshness on homepage, reports, river hub, planner, shared plan, widget, and social preview share a snapshot ID and timestamp; CI rejects mismatches; stale narrative is suppressed.

3. **Close `segment_cache` RLS.**

   **Acceptance:** Deployed policy/grant export shows `anon` and `authenticated` cannot INSERT, UPDATE, or DELETE; negative tests using the public key fail; legitimate server cache generation still passes; existing cache is integrity-checked.

4. **Upgrade the vulnerable runtime.**

   **Acceptance:** `npm audit --omit=dev` has no unaccepted High/Critical advisory; every exception has owner, exploitability note, compensating control, and expiry; build/typecheck/lint and principal-journey smoke tests pass on the supported Next version.

5. **Eliminate misleading safety output.**

   **Acceptance:** Dangerous, stale, unknown, unavailable, and contradictory inputs cannot render a positive/green recommendation or float time. Automated fixtures cover every state on all public surfaces.

6. **Make the mobile result work under poor connectivity.**

   **Acceptance:** On an agreed slow-network profile, a returning user sees a timestamped last-valid trip summary within 1 second and current calculation/error status within 2 seconds; stale dependent values are not presented as current; retry and text-only paths are keyboard accessible.

7. **Align privacy promises and media handling.**

   **Acceptance:** A signed data inventory maps each field to purpose, processor, retention, visibility, and deletion path; policy/UI copy match it; uploaded media is re-encoded with metadata removed; a test image with GPS EXIF is published without EXIF.

8. **Harden admin and machine authentication.**

   **Acceptance:** Admin bearer material is unavailable to JavaScript; CSRF and session-expiry tests pass; every admin/cron/callback route is covered by an auth matrix; missing secrets fail closed; CSP no longer requires `unsafe-eval` and uses nonces/hashes for scripts.

9. **Add anomaly detection for trip logistics and data freshness.**

   **Acceptance:** Alerts fire for gauge refresh failure, snapshot contradiction, abnormal shuttle/river/straight-line ratios, missing calibrated inputs, planner 5xx spikes, and stale partner widgets; each alert has an owner and runbook.

10. **Field-calibrate the most-used routes.**

    **Acceptance:** Top routes covering at least 80% of planning sessions have documented gauge/segment provenance, observed trip samples across vessel/flow bands, confidence and last-reviewed date, plus a user-visible uncertainty statement; residual error is measured and reviewed quarterly.

## Acceptance scenarios for release review

Before calling the backlog complete, run these scenarios on desktop and at least one real iOS VoiceOver and Android TalkBack device:

1. A first-time floater identifies a suitable river, explains why it is suitable, names the data age/source, selects valid put-in/take-out points, understands time uncertainty, sees hazards/legality, and knows the next step without interpreting a chart.
2. A returning mobile user opens live conditions and starts a plan under slow, failed, and recovered data. No old value is mistaken for current data.
3. Fixtures for dangerous, stale, unknown, contradictory, and unavailable conditions never produce a safe recommendation, confident time, or positive status color.
4. Keyboard and screen-reader users complete menus, river discovery, access selection without the map, dialogs, forms, errors, sharing, and dynamic result updates with visible focus and correct names/state.
5. Every admin, cron, callback, upload, feedback, subscribe, report, and public API route has positive/negative auth, schema, size, rate, cache, and error tests appropriate to its risk.
6. Rich text, JSON-LD fields, external URLs, images with metadata, malformed multipart data, and third-party payloads cannot execute script, navigate to unsafe schemes, expose metadata, or bypass moderation.

## Reproduction and command record

The following non-destructive checks support this report:

```text
npx tsc --noEmit                         PASS
npm run lint:tokens                      PASS
npm run check:eddy-knowledge             FILE CHECKS PASS; live DB cross-check skipped
npm run lint                             CODE WARNINGS; token stage separately passed
npm audit --omit=dev --json              20 runtime: 8 High, 12 Moderate, 0 Critical
npm audit --json                         24 total: 11 High, 13 Moderate, 0 Critical
tracked-file secret marker scan          no obvious matching secret material
GitHub open work                         PR #920 only; no open issues
```

Lint warnings included raw `<img>` use and missing React hook dependencies in embed/admin components. The repository defines no general unit/integration test command. A production build was not run because the audit was constrained to read-only checks apart from this report and a build would generate artifacts; CI build coverage should be added rather than inferred.

## Final recommendation

Do not start with a visual redesign. Spend the first month making every safety and logistics answer internally consistent, identity-safe, policy-protected, privacy-accurate, and observable. Then simplify how those trustworthy answers are presented. Eddy’s brand and content are already strong enough to earn attention; the next stage is earning the confidence to be used at a gravel-bar decision point with one bar of service.
