// src/lib/flow-providers/usgs-legacy.ts
// The ONLY module permitted to name waterservices.usgs.gov.
//
// WHY THIS FILE EXISTS
// USGS decommissions WaterServices in Q1 2027, with degradation authorized from
// August 2026 (https://waterdata.usgs.gov/blog/api-waterservices-decom/). The
// migration off it touched four call sites in three directories, because the
// host name had been re-typed in each — ./usgs.ts kept two constants,
// ./usgs-historical.ts had its own pair, and three scripts hardcoded the site
// service inline. ./usgs.ts even carried a comment explaining that a second
// copy of the MODERN base URL was how two paths would end up on different API
// generations; the same reasoning applied to the legacy URLs and nothing
// enforced it.
//
// So: one module, and src/lib/usgs/no-legacy-urls.test.ts fails the build if
// any other source file names the host. The next deprecation is then a one-file
// change that grep can prove is complete.
//
// ⚠️ EVERYTHING HERE IS SCHEDULED FOR DELETION. Nothing new should import it.
// Each export below records what replaced it; when USGS_FLOW_API=modern-only
// has been running in production through a high-water event, delete this file
// and the fallback branches in ./usgs.ts that call into it.

/**
 * Instantaneous values.
 * Replaced by the OGC `latest-continuous` and `continuous` collections.
 */
export const LEGACY_IV_URL = 'https://waterservices.usgs.gov/nwis/iv/';

/**
 * Daily statistics (day-of-year percentiles), RDB only — `format=json` returns
 * HTTP 400 with an HTML error page.
 *
 * Replaced by the USGS Statistics API (./usgs-statistics.ts), which publishes
 * the same ladder minus p20/p80, plus a p90 this service always returned empty.
 */
export const LEGACY_STAT_URL = 'https://waterservices.usgs.gov/nwis/stat/';
