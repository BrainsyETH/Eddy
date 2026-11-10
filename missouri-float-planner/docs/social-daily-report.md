# Daily Report

Daily Report reuses the `daily_digest` slot and its existing schedule, master
switch, history and manual draft approval. Existing non-empty daily cells
enable the carousel; empty/off cells stay off. The visible name is Daily Report.
Weekend Forecast keeps its existing Remotion renderer. No database migration
or new secret is required.

## Content and visuals

- Two to five 1080 × 1350 JPEGs; the first widget is the cover, with no title slide.
- Up to three rivers, respecting enabled/disabled river settings, and up to two
  of Bull Shoals, Norfork and Table Rock. Each place gets one daily rotation slot,
  independent of the number of access points. Rotation uses the Central date.
- Rivers use the existing seven-day chart, gauge, condition, range and weather.
  Selection requires an unsuspicious reading and chart endpoint within three
  hours. Up to nine candidates are tried; unavailable data is skipped.
- Dams require a current, dated posted schedule. The normal widget preserves
  missing hours, minimum flow, observed turbine flow and independently dated
  downstream/lake/temperature measurements. Only today's chart is exported.
- Text comes from measured chart change or the posted schedule. No model writes
  it. Gauge-specific wording stays explicit; zero scheduled generation never
  becomes a claim of zero release or a safety verdict.
- `DailyReportSlide` renders the real `RiverEmbed`/`DamEmbed` components, shared
  chart math, icons and styles. Export styles are scoped. The capture time is
  explicit on every slide, so relative ages and the Now marker have context.

## Rendering and publication

`buildPostContext` creates one immutable widget snapshot. Manual generation and
the cron call `dispatchDailyReport`, storing it in the existing `render_request`
JSON before dispatching `render-daily-report.yml`. `media_type` stays `image`;
the versioned `daily-report-carousel` discriminator distinguishes it from a
single photo. `image_url` is the first slide for history/cover compatibility.

The workflow uses the existing SITE_URL, CRON_SECRET, GH_ACTIONS_TOKEN and
BLOB_READ_WRITE_TOKEN setup. It captures `/embed/report/<postId>/<index>` with
Playwright. That dynamic, noindex page requires the machine bearer and reads
only the saved snapshot. The worker sends the credential only to that export
path, waits for fonts/images, refuses overflowing slides, and uploads immutable
JPEGs. Deploy the export/callback routes before running this workflow.

The authenticated carousel callback validates the capture time, exact slide
count, distinct Blob JPEG URLs and saved report type. It atomically claims each
rendering row. Manual drafts become reviewable; scheduled drafts publish under
the existing auto-publish policy. A repeated callback cannot publish twice.
Instagram uploads child images and publishes one carousel parent; Facebook
attaches the ordered unpublished photos to one feed post. TikTok is explicitly
excluded because the existing connector only delivers video.

Review and retry use the complete saved image list. A partial set never falls
back to the cover; reports older than two hours or from an earlier Central date
require a new draft. A failed render can be retried without changing the snapshot.
Definitive scheduled failures remain in history but leave automatic retry when
superseded by a new scheduled attempt. Final-call timeouts stay outcome-unknown,
using the existing reconciliation rules.

## Checks

`npm run test:daily-report` runs the actual widget and carousel-preview components
with explicitly synthetic fixtures. It verifies 4:5 export bounds, a single
chart, the dam measurement row, capture time, mobile controls and keyboard
navigation. Screenshots go to `/tmp/eddy-daily-report` (REPORT_SMOKE_OUTPUT can
override this). The generated fixture route is ignored, development-gated and
removed afterward. It never publishes or reads production data.

`daily-report.test.ts` covers freshness, missing hours, daily rotation, immutable
assets, expiration, ordered provider payloads, partial failures, uncertain final
publish calls, callback authentication, draft review, idempotency and failed DB
claims. Run `make check-web` as well. A real provider delivery is only verified
after an approved draft is published; mocked tests do not establish that.
