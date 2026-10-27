# Website discovery and app acquisition

This change covers website downloads, contextual Smart App Banners, search
metadata and measurement. It does not rename the app, add review prompts,
launch ads, change App Store categories, or change the database.

## What ships

- `/app` always links to Eddy's published App Store listing. Public identity
  has committed defaults; optional URL/ID overrides remain validated.
- Header (including the mobile menu), homepage and footer link to `/app`.
- Root metadata supplies the iPhone Safari banner. River, access, gauge, dam
  and shared-plan pages supply the matching existing `eddy:` route. No new
  universal-link claims or native dependencies are introduced. iOS Safari
  receives metadata in the initial head instead of after the body has started;
  Next's default crawler handling and other browsers' streaming are preserved.
- `/rivers` sends a real river directory in its initial HTML, using the same
  server catalog already loaded for its summary and filters. The live charts
  replace it when ready; failed gauge requests preserve the directory.
- Canonical/social metadata identifies the rivers index, dams index and each
  dam. Support and photo-submission titles avoid repeating Eddy.
- Photo-submission forms are `noindex, follow`. The sitemap excludes those
  forms and the machine-readable endpoints, includes `/app`, preserves static
  pages and successful query groups during failures, and omits invented dates.
- Access-point structured data uses the explicit fee flag; unknown fees are
  omitted. Guides identify Eddy as the publishing organization and show only
  publication dates, without claiming a human review happened. `updated_at`
  changes when social automation writes `last_shared_at`, so it is excluded
  from visible dates, `dateModified`, `article:modified_time` and sitemap
  `lastmod`. A separate content-edit timestamp needs a follow-up migration;
  existing `updated_at` values cannot safely be backfilled as editorial dates.
- GA4 collection hosts are allowed by CSP and tested against the emitted
  headers, including embed routes. Download events carry placement, page path
  and campaign label.

## Metadata performance before rollout

iOS Safari must wait for `generateMetadata` so its native banner is in the
initial head. `/app` metadata only reads the campaign and dam query (no data fetch);
shared plans also perform a plan lookup and parallel river/access lookups.
Measure iPhone-user-agent TTFB on an authenticated preview versus the base
revision, for both cold and warm requests to `/app`, a river, and a shared plan.
Local fixture checks verify placement but do not establish Vercel latency.
Keep this as a rollout check while preview deployment protection blocks access.

The crawler regex is a snapshot of Next 16.3.8's default list, with an explicit
upgrade test; review the list when changing Next. Production config does not
import private framework modules. The Analytics CSP follows Google's current
non-Ads requirements, which include `*.google.com`; no DoubleClick connection
allowance is present.

## Campaign links

1. In App Store Connect, generate a campaign link for this app to obtain its
   provider token (`pt`). Set `NEXT_PUBLIC_APP_STORE_CAMPAIGN_URL` to that link
   and rebuild the website. The provider token stays the same for every campaign.
2. Give partners links such as `https://eddy.guide/app?ct=partner_name`.
   Use only letters, digits, `_` and `-`, with a maximum of 30 characters.
   Website ads can also use normal `utm_source`, `utm_medium` and `utm_campaign`
   parameters for GA; `ct` labels the onward App Store acquisition campaign.
3. An explicit `ct` is retained in session storage for this tab. Opening
   another campaign replaces it. Storage denial never prevents downloading.
4. `/app?ct=...` emits that campaign in both server-rendered download links
   and its native banner. Other cached pages use the shared configured banner
   campaign (or `website_banner`), preserving their public page caching.

Without a real provider token, the app remains downloadable and GA can record
clicks. Do not claim Apple campaign attribution is configured until the provider
token has been supplied. Apple Ads attribution is a separate reporting path;
these campaign links alone do not implement AdServices attribution.

## Dam-to-app links

Bull Shoals, Table Rock and Beaver have one compact invitation in the generation
card's footer: “Bull Shoals on your Home Screen.” and “Get Eddy for iPhone”.
Their former bottom resource button is omitted; other dam pages retain it.
The forecast and history remain adjacent to the generation card. Android hides
the invitation after hydration; cached dam HTML stays device-neutral. No code
tries to detect whether Safari's native banner is visible or the app is installed.

On October 26, 2026, the owner confirmed the dam widget is in the released app
and supplied the Bull Shoals screenshot used at `public/app-store/dam-widget.jpg`.
It is a labeled example, not live readings. Starring a dam does not configure
this widget: users add Dam generation and select a dam in Edit Widget.

`src/lib/dam-app-promotion.ts` is the shared allowlist for placement, landing
context and analytics; it stores IDs and campaigns, not another copy of dam
names. The footer receives the snapshot's name and the server-rendered app page
reads the registry. The link carries `dam=swl-bull-shoals-dam` (or the other
allowed ID) to `/app`, plus the default campaign `dam_bull_shoals`,
`dam_table_rock` or `dam_beaver`. An existing session campaign, including a
partner's `ct`, keeps priority. The separate `dam_id` event parameter preserves
dam-level reporting regardless of that campaign. Invalid or repeated dam
parameters fall back to the generic app page. Arbitrary native/return URLs
are not accepted, and the canonical stays `/app`.

The contextual app page names the dam and supplies its existing `/dam/<id>`
native route in Safari's Smart App Banner. `AppLink` remains an ordinary
document navigation so Safari receives the updated banner. The App Store
buttons retain the published listing. The QR encodes that app page's dam and
campaign query on `https://eddy.guide`, using a server-generated image with no
third-party QR service. It remains visible at any desktop width and hides on
iOS (including iPad desktop mode); viewport width is not a device detector.
The generic app page keeps its existing QR. This does not implement deferred
links after a new installation.

The footer emits `app_promotion_view` once per mounted dam page when at least
half of the invitation enters the viewport, with `label=dam_schedule`, `dam_id`
and `page_path`. It uses the same GA host, automation, frame and opt-out guards;
unsupported IntersectionObserver browsers omit the view event without hiding
the link. This is visibility measurement, not proof the visitor read the text.
The link emits `app_landing_click` with `label=dam_schedule` and `dam_id`.
The two download buttons emit `app_store_click` with `dam_id` plus their
existing placement, page path and campaign. Register `dam_id` as an
event-scoped GA4 custom dimension if it is needed in standard reports or
explorations. Compare visible invitations → app-page clicks → outbound store clicks;
neither click event proves an installation.

`npm run test:dam-page` verifies each CTA, contextual page, initial-head banner
and delegated click event with all network requests routed locally. It also
checks single-count visibility, partner attribution, Android hiding, a QR in a
narrow desktop window, the real screenshot and generic fallbacks. Real iPhone Safari Open
behavior and GA4 event receipt remain deployment checks.

## Website analytics scope

GA4 initializes after hydration, only in a production build on `eddy.guide`
or `www.eddy.guide`. Vercel preview/development deployments, local hosts,
all iframe contexts (including widgets inside Eddy's own blog), and browsers
reporting `navigator.webdriver` are excluded before the Google script loads.
Only a valid `G-...` ID from `NEXT_PUBLIC_GA_ID` or its legacy environment
alias `NEXT_PUBLIC_GA_MEASUREMENT_ID` enables collection. This is not a general
bot filter: automated browsers that hide WebDriver can still be counted, and
Linux visitors are not excluded.

Embedded widgets retain their independent `/api/embed/impression` beacon.
Those impressions measure widget use, separately from website sessions and
engagement. Opening an `/embed/...` URL directly in a top-level production
tab still counts as a website visit.

For manual production QA, run the following in the page's browser console
and reload **before** testing:

```js
sessionStorage.setItem('eddy_analytics_disabled', '1');
location.reload();
```

Remove that key and reload to resume collection in the tab. Setting the key
without reloading stops new custom events but cannot unload Google's already
running automatic tracking. Storage denial does not prevent ordinary visitor
analytics. This opt-out affects GA4 only, not widget impression accounting.

The root listener initializes Google once per document with
`send_page_view: false`. Eddy sends one explicit `page_view` for the initial
page and each pathname change, including Back/Forward. The last measured
pathname lives on the browser window so listener remounts do not duplicate it.
Query strings and fragments are state within a page: typing in Conditions,
changing filters, panning/zooming a map, choosing endpoints and changing a
campaign on the same pathname do not create additional views. Full document
loads still start a new view. URLs, history, sharing and navigation are unchanged.

Each view includes the current title, full location (retaining incoming campaign
parameters), pathname and previous measured page as referrer. The initial
referrer comes from the document. Preview, frame, automation and opt-out guards
apply before either initialization or sending. Existing action events remain.

**Required GA4 rollout setting:** In Eddy property 522140244, open Admin →
Data streams → the eddy.guide web stream → Enhanced measurement → Page views →
Show advanced settings. Turn off **Page changes based on browser history
events**, leaving the other measurement options on. This is required in
addition to `send_page_view: false`; that code option does not disable
Enhanced Measurement's history listener. Coordinate the setting with the code
deployment. Before the new code is live, turning it off temporarily omits
client-side navigation views; deploying the code first temporarily duplicates
them. Record the switch and deployment times and exclude that transition from
comparisons. If reverting to the old automatic implementation, restore the
history setting. Do not merge/roll out the manual sender without this handoff.

The desktop header, mobile menu, planning tabs and footer opt into delegated
`navigation_click` tracking with `data-ga-navigation` on their shared
containers. Events carry `label`, `placement` (`header_desktop`,
`header_mobile`, `section` or `footer`), `destination_path` and
`page_path`. Destinations omit query strings and fragments. External social
links, menu-toggle buttons and links outside those containers are excluded.
Explicit `data-ga-event` links keep their existing event instead of emitting
a second navigation event, so app acquisition and conversion names stay stable.
Register placement/destination_path as event-scoped custom dimensions if needed
in GA4 reports; do not mark ordinary menu clicks as key events.

For before/after reports, Map now targets `/plan` and the homepage app-link
placement is `homepage_app` rather than `homepage_hero`. Aggregate
`app_landing_click` across placements for the overall trend; retain the
separate labels to distinguish the changed placement.

Run `make check-web` and `npm run test:analytics-browser` (from the web folder)
before merging. The browser fixture exercises the analytics module with all
requests intercepted; it cannot prove events arrived in GA4. After deployment:

- Record the actual deployment timestamp and GA4 property timezone as the
  start of the clean baseline. Historical iframe/development traffic remains
  in earlier reports; do not treat the resulting count changes as growth or loss.
- In a normal production browser with analytics allowed, verify one initial
  `page_view`, one for each pathname navigation (including Back/Forward),
  no view for typing/filtering/map movement/endpoint edits, and no duplicate
  after a remount or campaign change. Confirm collection requests and GA4
  DebugView. Extra views on query changes indicate the automatic history
  setting is still enabled; missing pathname views require checking the sender.
- Open a blog with an embedded widget and a partner-hosted widget. The parent
  website visit may generate GA events; the widget frame must load no Google
  tag or collection request, while its impression beacon still succeeds.
- Confirm preview/local/automated QA generates no GA requests. Check the
  existing download and planner events before changing key-event settings.

These are rollout gates, not a claim that the deployed property has already
been verified. Key-event configuration and Apple campaign attribution are
separate follow-ups.

## Release checks

- Run the web checks. The app-discovery regression also feeds generated banner
  arguments through the actual iOS cold/warm link handler.
- On a real iPhone in Safari, open a river, access point, gauge, dam and shared
  plan. With the app installed, tap Open and check the correct detail and Back
  behavior. Repeat cold and warm. With no app installed, check that the banner
  leads to Eddy's listing. Apple's native banner is not available in Simulator.
- Check header/menu/footer at phone, tablet and desktop widths. Download
  actions must work with no optional App Store environment variables.
- In GA4 DebugView, use Google's Tag Assistant to enable debug mode, then
  click both download buttons. Confirm `app_store_click`, `label`, `page_path`
  and `app_campaign`. Verify no CSP collection error in the browser. Test
  with normal analytics permission and without an analytics-blocking extension.
- Treat `app_landing_click` as a website navigation and `app_store_click` as
  an outbound click. Neither means an installation. Safari's native banner
  taps do not pass through the website's delegated click listener.
- In Search Console, inspect `/rivers`, `/app` and representative river/dam
  pages, submit the sitemap and confirm canonical URLs. Check that the photo
  forms are excluded by `noindex` after recrawling.
- In App Store Connect, compare product-page views, first-time downloads and
  conversion by campaign. Small campaigns may remain below Apple's reporting
  thresholds; missing rows alone do not prove tracking is broken.

## Baseline and access

Before rollout, export the prior 28 days from Search Console (queries, pages,
clicks, impressions and CTR) and App Store Connect (views, downloads and
conversion). Record the deployment date and compare equal periods, accounting
for seasonal changes. Establish the GA click baseline once collection works.

Production GA4 DebugView, Search Console property access, and App Store Connect
analytics require their account access. Repository tests and mocked collection
cannot confirm that real events or installations reached those accounts.

References:

- [Google Tag Platform: CSP](https://developers.google.com/tag-platform/security/guides/csp)
- [GA4: page views and automatic measurement](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [GA4: single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Google Search Central: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Apple: Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)
- [Apple: campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links)
- [Next.js: public environment variables are inlined at build time](https://nextjs.org/docs/app/guides/environment-variables)
