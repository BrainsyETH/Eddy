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
initial head. `/app` metadata only reads the campaign query (no data fetch);
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
- [Google Search Central: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Apple: Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)
- [Apple: campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links)
- [Next.js: public environment variables are inlined at build time](https://nextjs.org/docs/app/guides/environment-variables)
