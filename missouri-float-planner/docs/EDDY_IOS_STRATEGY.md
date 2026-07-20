# Eddy for iOS — Freemium Native App: Strategy & Product Dossier

> **What this is:** a self-contained strategy + implementation dossier for turning Eddy into a
> **free-to-download / paid-to-use** native iOS app. Written to be handed to any Claude Code
> session working on this repo — it captures every decision, the architecture, the phased
> roadmap, two adversarial review passes (with fixes folded in), and the still-open decisions.
>
> **Status:** discussion / strategy artifact — **not yet greenlit for implementation.** The first
> implementable step is **Phase 0** (backend foundations, this repo).
>
> **Rendered version:** https://claude.ai/code/artifact/66439720-8325-438c-b897-64c2c1044bbe

## Context

Eddy today is a Next.js 14 web app (`missouri-float-planner/`) on Vercel + Supabase (Postgres/PostGIS), covering ~13 live Ozark rivers (the original 8 plus Gasconade, Black, Bourbeuse, St. Francis, and the Buffalo in Arkansas; Elk, James, North Fork White in the ingestion pipeline) with live USGS conditions, access points, float-time estimates, an AI "Eddy Says" condition voice, a planner, embeds, and a social-posting engine. It has **no consumer accounts** and **no consumer payment path** (the existing `x402` layer only charges AI crawlers; admin auth is a separate HMAC scheme).

The goal: ship a **free-to-download / paid-to-use** native iOS app — a seasonal subscription where Eddy watches your rivers and works without cell signal. This plan is the product + architecture shape agreed through discussion.

## Decisions locked

- **Business model:** freemium; free to download, subscription to unlock premium use.
- **Payment rail:** Apple IAP via **RevenueCat** (entitlements synced to Supabase).
- **Pricing:** annual primary **~$29.99/yr** + secondary **~$5.99/mo** (deliberately worse value) + **7-day free trial**. Optional non-renewing "Season Pass" later.
- **Paywall stance:** *Balanced*, with premium **data** gated in-app (forecasts/history/vessel-times/chat) even though the web gives it free; durable moat = **push + offline + personal sync**.
- **iOS shell:** **React Native (Expo)** rebuild consuming the existing Next.js REST API as a headless backend. **Not** Capacitor.
- **Repo:** monorepo — new **`eddy-ios/`** (Expo) alongside `missouri-float-planner/`; shared TypeScript contracts in a root **`packages/eddy-types`**.
- **Auth:** **Sign in with Apple** + **Supabase anonymous → permanent** upgrade (enables local-first favorites that sync on login).
- **Alert transport:** **Expo push** (`expo-notifications` → APNs).
- **IA:** **5 tabs** — Map, River Reports, Alerts, Favorites, Profile.
- **Alerts gating:** in-app **feed is free to view**; **real-time push is paid** (condition display always free, incl. "dangerous").
- **Favorites:** local-first, sync on login.
- **v1 scope:** **Standard** = MVP + **offline river download**. Eddy AI chat deferred to fast-follow.
- **Mobile web** (noted, not locked): make it a teaser that funnels to the app; keep desktop web free for SEO/LLM discoverability.

## Information architecture (5 tabs)

| Tab | Role | Backend |
|---|---|---|
| **Map** | The **planner**: tap the condition-colored network → pick river → tap access points to set put-in/take-out → float-time computes (paid). | Existing `/api/rivers/[slug]` (geometry+bounds), `access-points`, `hazards`, `pois`, `/api/gauges`, `/api/plan`. Native MapLibre. |
| **River Reports** | The **list view**: all rivers ranked/filterable by current condition ("what's floatable now?") + Eddy Says + forecast/history. Deep-links into Map planner. | `/api/eddy-updates`, `/api/conditions/[riverId]`, `/api/gauges/[siteId]/history`, `/api/weather`. |
| **Alerts** | Feed of condition changes for starred rivers (free to view); push is paid. | **New** `river_condition_events` table. |
| **Favorites** | Starred rivers + saved floats. | **New** `starred_rivers`; `user_id` on `float_plans`. |
| **Profile** | Account, subscription status, notification prefs. | **New** `profiles`, `entitlements`. |

## Feature gating

- **Free:** browse curated **Eddy Rivers** + current condition (incl. "dangerous", always visible) + Eddy Says; the national **All Gauges** reference tier (search / near-me / viewport); **raw gauge alerts** — level / NWS flood-stage / user-set custom threshold (parity with free competitors); Alerts **feed view**; a small number of stars (local).
- **Paid (Eddy+):** **curated floatability push** ("your stretch is floatable") + predictive window alerts; **offline** river download; unlimited stars + saved floats + **cross-device (iOS) sync**; forecasts/history charts; vessel-specific float times + shuttle; Eddy AI chat (fast-follow).
- **The line, stated:** free = "watch any gauge like everyone else"; paid = "Eddy tells you it's floatable and plans the trip" — the translation only Eddy has, never the commodity others give away. (Supersedes the earlier flat "all push paid".)

## Phased roadmap

Back-planned from the immovable target: **spring 2027 season-open (~late March)**. ~8 months runway from now (Jul 2026). Effort assumes ~1–2 focused devs; solo stretches it.

| Phase | Goal | Key work | Timing |
|---|---|---|---|
| **0 · Foundations** (backend, this repo) | Account + entitlement + versioning spine | Supabase Auth (Apple + anon); `entitlements` + `withEntitlement` + `/api/webhooks/revenuecat`; `/api/app-config` version gate; `packages/eddy-types`; new tables (`starred_rivers`, `device_tokens`, `alert_subscriptions`, `river_condition_events`, `user_id` on `float_plans`) | Aug 2026 (startable now) |
| **1 · App skeleton + free core** | Running app, free experience | Expo scaffold + 5-tab nav + design-system port; Supabase/RevenueCat SDKs; **Map tab** (native MapLibre — long pole); River Reports; local-first Favorites; basic Profile; EAS + Sentry + PostHog | Aug–Oct 2026 |
| **2 · Paid hooks + paywall** | The moat features | Alerts (events→Expo push + feed + notify-me→trial); Offline (tile packs + cache + sync-back); on-river GPS tracking; RevenueCat offerings + paywall; planner-in-Map (gated) + saved floats | Oct–Dec 2026 |
| **3 · Polish, legal, hardening** | Submission + scale ready | Privacy labels, Terms/EULA, account deletion, UGC moderation; camera ground-truth; CDN caching (`/api/rivers` N+1) + per-user limits + jittered push; a11y + offline states | Dec 2026–Jan 2027 |
| **4 · Beta → launch** | Harden + launch ahead of surge | TestFlight external beta via outfitter/email; iterate via OTA + flags + PostHog + RevenueCat experiments; public launch amplified by widgets + QR + social | Feb–Apr 2027 |

**Critical path:** Phase 0 → Map tab (Phase 1 long pole) → Alerts/offline/on-river (Phase 2). River Reports/Favorites/Profile parallelize. Legal + EAS/CI + analytics run alongside from Phase 1, not as a final bolt-on. **Stretch:** rough live-water private beta in the tail of the 2026 season (Sept–Oct) if Phase 0 + map move fast. **Miss spring 2027 → lose a full year** of the pre-season install surge.

## Backend build (in `missouri-float-planner/`) — the critical path

The READ API is already headless-ready (all JSON, no session cookies). Net-new work is auth + per-user data + entitlements + alert delivery:

1. **Consumer auth** — stand up Supabase Auth for end users (first real use of `auth.uid()`). The SSR cookie plumbing (`src/lib/supabase/{server,client,middleware}.ts`) is **web-only** — the Expo client authenticates with `Authorization: Bearer <jwt>`, so add a `createClientFromRequest(request)` helper for route handlers and store device sessions in `expo-secure-store` (Keychain). Dashboard ops prerequisites nothing in-repo tracks: enable **anonymous sign-ins** + the **Apple provider** (Services ID; the signing secret expires ~6-monthly — calendar the rotation).
2. **New tables + RLS** (mirror the owner-scoped `community_reports` policy from `supabase/migrations/00006_*`/`00085_*`): `profiles`, `entitlements`, `starred_rivers`, `saved_floats` (or `user_id` on `float_plans`), `river_condition_events`, `device_tokens`, `alert_subscriptions`. **Anonymity in RLS:** `entitlements`/`device_tokens`/`alert_subscriptions` writes require a **non-anonymous** JWT (`is_anonymous` claim check); `starred_rivers` allows anonymous. **`float_plans` privacy:** replace the world-readable SELECT (`USING (true)`, `00004`) with owner-scoped read + a `SECURITY DEFINER` share-code lookup once `user_id` lands — a saved float predicts where a person will physically be.
3. **Entitlement guard** — new `src/lib/entitlement.ts` exposing `withEntitlement()` (HOF mirroring `withX402Route` in `src/lib/x402/engine.ts`) + imperative `requireEntitlement()` (mirroring `requireAdminAuth` in `src/lib/admin-auth.ts`). **Gating boundary (resolved, default):** existing public read routes stay unauthenticated + CDN-cacheable — wrapping them would break the accountless free web; premium data ships through new entitlement-guarded **`/api/me/*` twins** (e.g. `/api/me/plan`, `/api/me/history`); in-app gating of data that's also free on web is accepted as **soft (client-side)** for v1. Marketing says "sync across your **iOS devices**" (no web accounts until v2); keep a support/refund macro for "it's free on your website"; paid messaging centers on push + offline + sync.
4. **RevenueCat webhook** — new `src/app/api/webhooks/revenuecat/route.ts`, a near-copy of `src/app/api/webhooks/resend/route.ts` (raw body → shared-secret `Authorization` header, constant-time compare → fail-closed → idempotent service-role upsert into `entitlements`, keyed on event id). Handle the **full event vocabulary** (`INITIAL_PURCHASE`/`RENEWAL`/`CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE`/`TRANSFER`) — entitlement state = latest event's `expires_at`, not a boolean; on `TRANSFER`, re-key the row. **Identity rule:** require Apple sign-in immediately before trial/purchase (the notify-me flow already goes sign-in → trial) so `appUserID` = a *permanent* Supabase user id, never an anonymous one; persist the Supabase session refresh token in iOS **Keychain** so reinstalls keep identity.
5. **Alert engine wiring** — harden `update-gauges` for *paid* delivery (pass-2 findings; the cron was built for social posts): **(a) outbox** — insert the `river_condition_events` row and flip `river_gauges.last_condition_code` in one RPC/transaction; fan-out never runs off the in-memory list — a delivery pass selects `WHERE push_delivered_at IS NULL`, sends, stamps per event (at-least-once, survives killed runs; Vercel crons never retry — add a Sentry dead-man check-in on the cron). **(b) concurrency** — wrap the run in the existing `try_cron_lock` (`00090`, currently used only by post-social); make the code flip a guarded CAS (`.eq('last_condition_code', oldCode)`, emit only if a row updated); unique constraint on events as backstop (hourly + 15-min crons both fire at :00 on high-frequency stations today). **(c) data-quality gate before any Transition** — classify from the **primary-unit value only** (the ft↔cfs fallback turns a stage-sensor outage into a false `dangerous`); skip suspect qualifiers (`Eqp`/`Ice`/estimated) and stale/flatlined readings; debounce `dangerous`/`high` (2 consecutive readings — fits inside the honest 20–75-min window); apply the NWS flood-stage override (`00165`) in this path. **(d) the `floatable` class** — the classifier only knows warning/easing/recovery; `low|too_low → good|flowing` (the "notify me when it's floatable" moment the funnel is named for) is currently *dropped* — persist ALL transitions; `alert_subscriptions` gets `kind ∈ {floatable, safety, all}` + `one_shot`; push dedup keys on events, not `social_posts`. New `src/lib/push/expo.ts` sender.
6. **User endpoints** — `src/app/api/me/*` for profile, favorites, saved-float list, alert subscriptions, device-token registration.
7. **Contract hygiene** — move the two inline `EddyUpdateEntry`/`EddyUpdateResponse` interfaces into `src/types/api.ts`; lift shared types into root `packages/eddy-types`; hand the RN team `/api/openapi.json`; set an explicit `EddyiOS/1.0` UA so x402 never matches.

## The alert engine — ~60% already built

`update-gauges` (hourly + 15-min for high-frequency stations) already diffs each river's newly-computed condition (`src/lib/conditions.ts` `computeCondition`) against persisted `river_gauges.last_condition_code`, emits typed `Transition`s, and classifies them via `src/lib/social/condition-alerts.ts` (`warning`/`recovery`/`easing`) with 4h cooldown, per-river dedup, and multi-river storm digest. **Net-new = persist events + subscriptions + device tokens + Expo transport + fan-out hook — PLUS the pass-2 hardening in backend step 5 (outbox, cron lock/CAS, data-quality gate, `floatable` class): the existing cron was built for social posting, not paid safety-adjacent delivery.** Difficulty: moderate.

## The map — native MapLibre rebuild

Reuse the **keyless self-hosted styles** (`public/map-styles/eddy-immersive.json` / `eddy-natural.json`, built by `scripts/build-map-style.ts`) + AWS Terrain DEM hillshade. **Line features** (river condition, network, route) are GeoJSON and port cleanly. **Point features** (access/gauge/hazard/POI) are currently HTML DOM markers in `src/components/map/MapContainer.tsx` — rebuild as native MapLibre annotations/`symbol` layers. Geometry comes from PostGIS via existing API routes. (The statewide SVG "Observatory" at `/river-map` is a separate hand-rolled render — defer any native recreation to v2.)

## Phasing

- **v1 (Standard):** 5 tabs, Apple auth + anon upgrade, RevenueCat entitlements + webhook, push alerts (feed free/push paid), favorites + saved floats + sync, native map/planner, River Reports, **offline download**. Target: before spring float season.
- **Fast-follow:** Eddy AI chat; Season Pass SKU; mobile-web teaser funnel.
- **v2:** native "Observatory" aesthetic; optional consumer accounts on web + web↔app handoff.

## Go-to-market

**Onboarding → paywall (activation):** never wall the first taste — first launch answers "floatable?" in <10s, no login. The paywall trigger is the contextual **🔔 "Notify me when it's floatable"** tap (peak willingness-to-pay: they want to float and are waiting) → Apple sign-in + 7-day trial. Secondary contextual triggers: offline download, vessel-specific float time, forecasts. Local-first starring builds investment before any ask.

**Distribution — the unfair advantage:** Eddy already ships co-branded **embeddable widgets** (planner, "Floatable From Here," live conditions) that outfitters/campgrounds/Airbnbs host, with ready-made email campaigns (`marketing/email-outfitters.html`, `email-campgrounds-airbnbs.html`) and a live example (dillardmill.com/floating). That widget network = a near-free install engine reaching people actively planning a float. Actions: add "Get the Eddy app for alerts" CTA to each widget; enlist outfitters as install partners (QR at access points / shuttles / counter); route the existing FB/IG/TikTok condition-change posts to app installs. **Launch before spring float season (Mar–Apr)** or wait a year.

**Pricing validation:** use RevenueCat Experiments to A/B price ($24.99/$29.99/$39.99), trial length, and season-pass-vs-annual live — no app update. Price-test the contextual (notify-me) paywall specifically. Consider a founding-floater launch price ($19.99, locked-in) to seed reviews/word-of-mouth via the outfitter community. Instrument free-tier signals (notify-me tap, float built, offline tried) as the conversion funnel.

**App Store submission:** IAP mandatory (3.1.1) — RevenueCat covers it; Balanced free tier satisfies "value before the wall"; RN rebuild sidesteps 4.2 web-wrapper rejection. Bank the checklist: visible Restore Purchases, Sign in with Apple, in-app account deletion (5.1.1(v), in Profile), price/auto-renew + Terms/Privacy disclosure on the paywall (reuse `/terms`, `/privacy`), StoreKit sandbox test.

## Native superpowers, offline & economics (dug in)

**On-river GPS = flagship premium feature.** Live blue-dot-on-river, distance/ETA to take-out, next access point, hazards-ahead — works fully **offline** (GPS is satellite). Free: "rivers near me / nearest floatable" (sort River Reports by proximity+floatability; app version of the "Floatable From Here" widget). Paid: on-river live tracking. Free safety add-on: "share my float" live-location to an emergency contact. Location perms asked **contextually**. **Background-location resolution (default — flag to override):** v1 ships **foreground-only** — "rivers near me" + on-river blue dot with **keep-awake** while navigating; background ("Always") tracking + "share my float" move to **fast-follow**, where the battery strategy, heavier privacy labels, and App Review 2.5.4 justification can be handled off the critical path. Rationale: dry-bag tracking is real, but not worth schedule risk on the spring deadline — keep-awake in a mount/case covers the on-water experience for v1.

**Camera ground-truth flywheel.** Native camera+GPS feeds existing `community_reports`/`river_photos`/`visuals/byLevel` with frictionless geo/time-tagged photos → gauge calibration + richer by-level visuals → better product. Moderation pipeline already exists (`status:'pending'`).

**Offline + location are one system.** "Download a river" = offline tile pack (river-corridor bbox+buffer) + cached geometry/access/hazards + saved float + last-synced conditions shown with "as of [time]". expo-sqlite / React Query persistence; queue photos/reports and sync on reconnect. **Tile-source correction:** only the *style JSONs* are self-hosted — actual tiles stream from OpenFreeMap (vector), CARTO, and ESRI (satellite), and **ESRI/CARTO terms don't allow offline caching**. Safest path: self-host vector tiles as **PMTiles river-corridor extracts** (tiny, cheap, ToS-clean); **exclude satellite from offline v1**; spike `@maplibre/maplibre-react-native` offline-pack support early in Phase 1.

**Backend hardening (before launch):** forced-upgrade via a tiny **`/api/app-config`** endpoint (`min_supported_version` + kill-switches) + **additive-only API discipline** — far cheaper than duplicating ~30 routes under `/api/v1`; reserve a real `/v1` for the first genuinely breaking change. Thundering herd (push → mass open) is a **caching** problem: conditions are ~15-min fresh, so short CDN edge-cache on `/api/rivers` (fix N+1) + `/api/conditions` collapses the herd — **these routes must also be excluded from the middleware matcher** (`src/middleware.ts` runs the Supabase session refresh over them today, which marks responses uncacheable and would silently defeat the edge cache); move rate limits per-user (carrier NAT breaks per-IP); jitter the push fan-out. **Fan-out mechanics:** batch Expo pushes (~100/request), raise `maxDuration` on `update-gauges` (route sets 60s today; Pro allows 300s) and/or move delivery out of the request via the outbox, prune dead tokens on `DeviceNotRegistered` receipts, re-check entitlement at send time; move fan-out to a queue at scale. **Latency honesty:** USGS gauge lag + 15/60-min cron ⇒ alerts land within **~20–75 min** of the real transition — market "first to know," never "instantly."

**Economics:** Apple **Small Business Program → 15%** (enroll) — ~$25 net on a $29.99 annual sub, **~85% gross margin** (USGS free; Mapbox/OpenWeather cacheable; map styles + PMTiles cheap to self-host; push cheap). Viability hinges on **retention** (annual hedges seasonal churn) + **CAC near-organic** (widget/outfitter channel). Legal: App Privacy labels (precise location/photos/purchases), keep analytics first-party to skip ATT, auto-renew disclosures + updated Terms/EULA/Privacy for paid+location+UGC, UGC moderation/report path, in-app account deletion (Profile), refunds via RevenueCat webhook → revoke entitlement.

## Two-tier coverage: Eddy Rivers + All Gauges

**Already ~built.** The Observatory already ingests **every active MO+AR stream gauge** with a live reading via the modern USGS OGC API (`src/lib/usgs/mo-sites.ts`; bbox `-95.9,32.9,-88.9,40.7`; capped 900; discharge-only) as **"neutral context nodes"** under an explicit **"data honesty" doctrine** (`docs/mo-surface-water-observatory.md`): raw gauges show *location + flow + data-age only*, deliberately NOT in the floatability taxonomy because they carry no curated thresholds. The two-tier model = **promoting this existing layer to a first-class searchable/starrable/alertable tier in the app** — not a new build.

**The line (already the team's principle):**
- **Eddy Rivers (curated, paid moat):** per-stretch floatability thresholds → "your stretch is floatable" + trip layer (access, float time, shuttle, hazards, offline, on-river GPS).
- **All Gauges (raw reference, parity):** live reading + hydrograph + **official NWS/AHPS flood stage** + **user-set custom threshold** ("notify above 3.2 ft"). Eddy never issues a floatability verdict on an uncurated gauge — user or NWS sets the line. Full parity with RiverApp/RiverTrax/Rivercast (all rely on user-set markers) AND sidesteps the pass-2 floatability-liability problem.

**Fixes:** the pass-2 coverage churn — Elk River, North Fork White, any creek appear as reference gauges **day one**; curation becomes an *upgrade path, not a gate*. Starred raw gauges = the **data-driven curation priority signal** (curate what people watch).

**Freemium reframe (revisits "all push paid"):** raw-gauge alerts are the *commodity competitors give free* → make basic gauge/flood/custom-threshold alerts **free** (parity + acquisition), making the **curated floatability + trip layer the defensible paid premium** ("we charge for the translation only Eddy has, not for what others give away"). Casual majority pays for the "no numbers to know" verdict; power users use free raw alerts (never going to pay anyway). Healthier line than "all push paid."

**Incremental build (on existing ingestion):** add gauge-height (00065) + hydrograph + NWS flood-stage overlay + **search / "gauges near me"** (900 pins can't firehose on mobile — reference gauges are *found*, not browsed, keeping curated rivers the hero). Modern OGC API already (survives legacy decommission); percentile "% of normal" is the at-risk piece (pass-2).

**Resolved:** **national** raw coverage, **secondary** to curated, **searchable reference** (not co-equal browse); **raw alerts free, curated floatability paid.**

**UI/UX layout (curated hero + national raw secondary):**
- *Two visual languages* — curated = vivid/Eddy-voiced/rich sheets; raw = muted neutral dots/rows, data-only, lean sheets (existing "data honesty" styling, extended). Tier legible at a glance.
- *Discovery, not display* — raw gauges surface via search / "gauges near me" / **viewport-bounded + clustered** map layer / stars. Never render all ~28k.
- *Map:* curated rivers vivid by default (hero); raw gauges a toggle-on clustered dot layer bounded to viewport; tap curated → rich plan sheet, tap raw → lean sheet (reading + hydrograph + NWS flood stage + "set my alert" + star).
- *River Reports:* opens on curated-by-floatability; segmented **"Eddy Rivers | All Gauges"** + cross-tier search; uncurated search result → raw gauge + "curation coming — prioritize?" demand signal.
- *Alerts:* one feed, two languages — curated floatability (paid) + raw threshold/flood (free); locked-floatability upsell shown inline to free users.
- *Favorites:* Rivers section (curated) + Gauges section (raw + user threshold); raw star **graduates in place** when curated.
- *Graduation* — raw→curated upgrades keep the user's star/alert.

**National = cheap:** curated stays pre-ingested + cron-updated (Ozarks); raw gauges fetched **on-demand** per search/viewport (lazy, briefly cached — no 28k pre-ingest); raw-alert polling set = **union of subscribed gauges** (bounded by users, not 28k), feeding the pass-2 outbox/fan-out. **Naming:** national raw coverage argues against any state/region in the app name (not "Missouri," not over-indexing "Ozarks").

**Resolved UI:** map raw-discovery = **all three** (viewport-bounded clustered layer + search + near-me pins); Reports = **segmented "Eddy Rivers | All Gauges" toggle**; tier labels = **"Eddy Rivers" (curated) / "All Gauges" (raw)**. Stitch mockups of Map + Reports + raw-gauge sheet are the natural next artifact.

## Retention & seasonality design

**Key insight:** annual renewals **self-align to the season** (June buyer renews in June, primed to pay) — the at-risk cohorts are narrower: fall buyers (renewal lands post-season), monthly subs (rational October churn), and winter-silence forgetters. Four mechanics:
1. **Float log** (the churn-proofing moat): saved floats + on-river sessions + photos auto-compose a trip journal — value that accrues in the account and is lost by canceling. Cheap: composes data already stored. (RiverTrax's "River Journal" validates demand.)
2. **Engagement arc:** pre-season comeback content (Feb–Apr; the first post-flood floatable alert is the year's most valuable push) · post-float **trip recap** (shareable; feeds log + UGC ground-truth prompt) · off-season monthly-max passive pushes (watershed status) + a December **"Your Year on the Rivers"** recap — renderable as a personalized shareable video via the existing **Remotion pipeline** (winter acquisition via shares).
3. **Renewal & win-back:** show the float log in-app ~2 weeks pre-anniversary (before Apple's reminder — renewing = re-upping a season); from ~September the paywall leads with Season Pass, not annual; **March StoreKit win-back offers** via RevenueCat ($19.99 comeback); monthly October churners are recaptured each spring, not mourned.
4. **Metric reframe:** judge in annual cohorts — **season-over-season return rate >60%** (renewal + resurrection) and season-over-season net subscriber growth, never November MRR (it will always look scary; don't panic-discount a healthy seasonal product).

## Break-even model (honest numbers)

**TAM:** ~300–500k annual Ozark floaters → the addressable unit is the **trip captain** (~1 per group of 4–6): **~60–120k** people; they're exactly who outfitter widgets/QR reach. **Unit math:** net ARPU ≈ $25 ($29.99 − Apple 15%, blended); run costs ≈ $3–4k/yr; marginal cost ≈ $0. **Milestones:** ~150 subs = pays for itself; 1,000 = $25k/yr; 3,000 = $75k/yr. **Year-1 honest read:** 5–15k realistic installs × 2–5% conversion = **100–750 subs ($2.5k–$19k)** — validation that covers costs, not income; the case rests on compounding (season-2 installs on season-1 reviews, coverage growth, predictive alerts, future outfitter B2B leg). **Installs, not price, are the dominant variable** → the widget/outfitter channel outranks any pricing decision.

## Onboarding choreography + launch metrics

**Six screens:** (1) launch, no wall, soft contextual location ask; (2) the <10s answer — condition badge + Eddy Says (**= activation**); (3) star a river (local, zero friction); (4) starred river too low/high → **"🔔 notify me when it's floatable"** = the paywall trigger; (5) paywall: Apple sign-in → 7-day trial, annual-first, push+offline+sync-led, visible Restore + disclosures; (6) push-permission **primer first**, then the one-shot iOS prompt, land back with the bell live. Browse-only users never blocked (they're next season's converts).

**Targets:** install→activation >60% · activation→star >25% · star→notify-me >15% (north star) · paywall→trial >8–10% · trial→paid >35% · paid push opt-in >80% · free D30 >15%. **Pre-agreed decision rules (90 days into season):** <3k installs = awareness problem (fix distribution); >10k installs but <2% conversion = paywall/price problem (move the line); refunds >5% or push-disable >30% = alert-quality problem. Kill signal = all three failing after a full season of iteration, not before.

## Ship & learn (stack)

App Store review latency is the enemy for a seasonal app. **EAS Update (OTA)** pushes JS/asset-only fixes instantly (native changes still need a full build); pair with **feature flags + A/B** (PostHog/RevenueCat) to iterate the freemium funnel without an App Store round-trip.

**Lean stack:** EAS (Build/Submit/Update — cloud iOS builds, managed signing, auto-submit) · PostHog (analytics + funnels + flags + experiments + session replay) · RevenueCat (subscription analytics free: trial→paid, churn, MRR, LTV, cohorts) · Sentry (crash/error).

**Pipeline:** two decoupled pipelines (web on Vercel, mobile on EAS; path-filter the monorepo; mind EAS + `packages/eddy-types` Metro config). **TestFlight external beta = soft-launch**, recruited via outfitter channel + email list, run late-winter/early-spring before the install surge. Native builds ~monthly (batch), OTA continuously, backend continuously (with `/v1` back-compat).

**Instrument the funnel** — north-star event is the **"notify me" tap**: install → first open → answered "floatable?" → starred → **notify-me** → paywall → trial → subscribe → retained. Wire RevenueCat → PostHog (subs + product events in one funnel). Build attribution (deferred deep links / UTM on widget + QR CTAs) to learn which outfitter partnerships convert. Keep analytics first-party → skip ATT.

## Plan review — pass 1 findings (folded in above)

1. **Identity × purchase lifecycle (major, fixed):** anonymous-first auth collided with IAP — a purchase made under an anonymous `appUserID` + a reinstall orphans the entitlement. Resolved: Apple sign-in required immediately before trial/purchase, Keychain session persistence across reinstalls, full RevenueCat event vocabulary incl. `TRANSFER` re-keying.
2. **Offline tile licensing (major, fixed):** offline packs against ESRI/CARTO tiles violate their ToS, and vector tiles aren't actually self-hosted today (only the styles are). Resolved: self-hosted **PMTiles** corridor extracts; satellite excluded from offline v1; Phase-1 spike on RN MapLibre offline packs.
3. **Background location (resolved by default, overridable):** v1 foreground-only + keep-awake while navigating; background "Always" tracking + share-my-float as fast-follow — see resolution above.
4. **Alert latency + fan-out (moderate, fixed):** honest ~20–75-min latency in copy; batched Expo pushes + `maxDuration` + dead-token pruning + send-time entitlement re-check + queue at scale.
5. **`/api/v1` over-engineering (simplified):** replaced wholesale versioned namespace with `/api/app-config` min-version gate + additive-only discipline.
6. **Smaller:** keep anonymous share-by-link on `float_plans` working when `user_id` lands (public short-code read stays); the free Alerts feed needs a **public** `river_condition_events` read endpoint (free users may never sign in — feed filters client-side by locally-starred rivers); purge stale anonymous auth users periodically; WidgetKit home-screen widget ("Current: Flowing 🟢") + Live Activity during a float are strong fast-follows (native targets — not OTA-able).

## Plan review — pass 2 findings (adversarial + competitive)

**Folded in above:** alert-engine hardening (outbox + cron lock + CAS flip + data-quality gate + `floatable` class — the social-era cron loses transitions on a dead run, double-fires at :00, can push false `dangerous` from a stage-sensor outage, and lacks the exact alert the funnel is named for); gating boundary (`/api/me/*` twins; public routes stay free + cacheable + excluded from the session middleware); mobile Bearer-token auth + anonymous-RLS distinctions + Supabase dashboard ops; `float_plans` owner-scoped read; corrected river count (~13 live).

**⚠️ Open product decision — paid float times:** `docs/FLOAT_DATA_ACCURACY_AUDIT.md` (2026-07-01) rates the flat per-vessel speed model **"Unsafe"/uncalibrated** — 7–23% short on the Current, 31–60% on small creeks, optimistic *exactly in the optimal-flow band*; the `float_segments` calibration table is empty in prod; dangerous water still returns an estimate. Charging for that number changes its legal character (payment implies fitness for purpose). **Resolution (default — flag to override):** pursue **(a) calibrate-then-charge** — a Phase 0–1 workstream calibrates headline rivers from outfitter/NPS published times; float times ship paid only as **ranges, never points**, suppressed entirely on `dangerous` water, framed "estimate — verify with your outfitter." **Automatic fallback:** if calibration hasn't landed by end of Phase 2, float times drop out of the paid bundle and stay free-with-caveats (the subscription sells push + offline + sync + forecasts) — we never charge for a number the audit calls unsafe.

**Competitive reality:** gauge-level push alerts are a **commodity** — RiverApp (20k+ rivers, custom level alerts), RiverTrax ("Sweet Spot" alerts that watch the NWS 5-day forecast for your window), Riffle (premium NOAA predictive flow), Rivercast (12k gauges, flood alerts); free MO sites cover 10–25+ rivers (missourifloattripguide.com, mofloats.com, moherp). Eddy's moat is the **translation + trip layer**: curated per-stretch floatability (no CFS numbers to know), plain-English Eddy Says, access-point→access-point planning, offline corridors. Paywall copy sells *"know when YOUR stretch is floatable — and get the whole trip"*, never "river alerts." **Predictive window alerts** ("this weekend looks floatable," from the AHPS 72h forecast already ingested via `/api/usgs/mo-forecast`) would leapfrog RiverTrax — v1-stretch/fast-follow. **Coverage:** target **Elk River** (+ North Fork White) live before launch — Elk/Noel is one of MO's highest-volume float destinations and free competitors list it; ship in-app "request a river" + "coming soon" states; brand **"Ozarks" over "Missouri"** (Buffalo is AR; multi-state doc F3 warns on state assumptions); never hardcode river lists in the RN client; USPTO knockout search + reserve the App Store name early (e.g. "Eddy: Ozark River Conditions").

**External risk — USGS legacy decommission (early 2027; possible degradation from Aug 2026 — inside the build window):** modern OGC API is primary with legacy fallback, but daily **percentile statistics are legacy-only** (no confirmed modern equivalent) and feed the CFS condition ladders + "× normal" framing. Phase 0/3: burn in `USGS_FLOW_API=modern-only` well before spring; **snapshot day-of-year percentiles into a DB table before Q1 2027**; track the decommission bulletin as a launch-window risk.

**Legal surfaces (Phase 3 = documents *and* surfaces):** current `/terms` says Eddy is "**free**"; `/privacy` says "No Account Required" and "we do not collect GPS" — all false under this plan; rewrite for paid + accounts + GPS + UGC and mirror in the EULA. Port the web disclaimer pattern into the app: persistent "planning aid — verify locally" on condition/planner screens, a one-line verify footer on **every push**, first-run safety acknowledgment. Marketing is "information, not advice"; "first to know," never a guaranteed warning (consistent with the outbox/at-least-once reality). Share-my-float (fast-follow) must be branded "**not an emergency service**," show last-fix age, and tell recipients signal loss is expected on-river.

## Open decisions (overridable defaults)

These are set to a sensible default so work isn't blocked, but each is a genuine product call:

- **⚠️ Paid float times** — default: calibrate-then-charge (ranges only, suppressed on dangerous water); auto-fallback to free-with-caveats if calibration slips past Phase 2. Never charge for a number the audit calls unsafe.
- **⚠️ Background location** — default: v1 foreground-only + keep-awake; background tracking + share-my-float to fast-follow.
- **Soft gating for web-free data** — accepted as client-side for v1; the durable paywall rests on push + offline + sync.
- **Un-dug threads:** outfitter **B2B revenue leg** (dashboards, premium listings, shuttle-referral fees — no Apple cut); **ASO / App Store product page** (naming, screenshots, Remotion preview video).

## Not yet covered (scope tail / risks)

**Engineering:** ⚠️ offline sync mechanics (in v1 — cache invalidation, stale-condition display, tile-pack size, sync-back); ⚠️ API versioning + forced-upgrade (old app versions persist for years); ⚠️ thundering-herd when a push fires (per-IP→per-user limits + caching on `/api/rivers` N+1 and `/api/plan` latency); mobile CI/CD + EAS OTA updates; deep/universal links + install attribution; Sentry crash reporting; Maestro/Detox E2E.

**Product/UX:** ⚠️ location & GPS (nearest floatable river, on-river positioning — native-only, could be premium); camera ground-truth UGC feeding `community_reports` (data-moat flywheel); design-system port (Tailwind/`.stitch/DESIGN.md` + Eddy persona → RN); notification UX depth; accessibility; no-signal states.

**Business/legal/ops:** ⚠️ Apple Small Business Program (15% not 30% under ~$1M); unit economics/LTV:CAC + scaling per-user costs (Mapbox/OpenWeather/push/Supabase); App Store privacy labels + subscription legal disclosures + updated Terms/EULA; refunds/churn/win-back + support load.

**Strategic:** Android (Google Play Billing ≠ IAP); multi-state IA (`docs/MULTI_STATE_SCALING_PLAN.md`); build capacity (who writes the RN app); consumer accounts on web + web↔app handoff; mobile-web teaser-funnel detail.

## Verification (when built)

- Backend: exercise `/api/webhooks/revenuecat` with a signed test payload → assert idempotent `entitlements` upsert; hit a `withEntitlement`-wrapped route with/without entitlement → 200/402; force a gauge transition in a staging row and assert a `river_condition_events` row + a push to a registered test token.
- App: drive install → anonymous star → Apple sign-in (stars persist) → subscribe in sandbox → gated feature unlocks → offline download → airplane-mode read.
