# USGS gauge audit fixes

The September 2026 audit covered the national catalog, curated gauges, web,
iOS and public API exposure. The six findings are addressed as follows:

| Finding | Change |
| --- | --- |
| Old readings appear current | Observation-time freshness; historical map toggle; newest valid sensor per parameter; retired sensors cannot borrow live timestamps; paginated latest readings; national ingestion every 15 minutes without source caching; iOS viewport refresh on foreground and every five minutes. |
| National detail pages fail | Standalone web pages resolve station existence and readings from the detail endpoint. Curated metadata is optional; transient failures offer retry. |
| Historical water quality appears current | Measurements older than 24 hours move to historical fields and dated displays, retaining source attribution. |
| iOS history/detail lag behind web | Provider-aware 90-day/year/custom ranges, expanded chart, table, CSV sharing, resolution/coverage disclosure, dissolved oxygen and seasonal record depth. |
| National seasonal statistics are sparse | Full paginated catalog, 256 rotating hourly batches, record-depth gating, and cached read-only USGS fallback for detail/history. Percentiles use the displayed current reading. |
| OpenAPI disagrees with responses | Actual list/detail/map/history envelopes, field names, nullability, range parameters, caps, forecast and coverage metadata. Captured responses guard the schema. |

No database migration or new native dependency is required. No production
writes, deployment or TestFlight release were performed while implementing.
The hourly percentile batches nominally cover the catalog every 256 hours
(about 11 days). Runs stop at a 270-second budget and rotate their starting point
on the next cycle. Cron counters distinguish failures, missing statistics and
unfinished batches. Seasonal bands still require ten years of discharge data;
stage comparisons remain disabled.

API map caps/totals still include historical stations; clients filter the
returned subset. A capped wide viewport may show fewer recent stations than
the cap, with the existing zoom-in disclosure.

Before release, check national gauge 07024175 and curated gauge 07018500, dated
historical water quality, and new cron counters. Exercise custom dates,
expansion, VoiceOver, CSV sharing and foreground refresh on an iPhone. Linux
validation covers types, lint, tests, bundling and archive completeness; native
visual/share-sheet behavior requires a device pass.

Fixtures were captured from the public API during reconstruction, shortened to
two time-series points, and augmented with the additive freshness/archive fields.
