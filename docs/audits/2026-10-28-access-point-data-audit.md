# Access-point data audit — October 28, 2026

Status: **read-only review; proposed corrections have not been applied**.
The audit found 25 issues and review candidates across the access catalog,
related landmarks and campgrounds, and web/mobile data delivery.
Source code was reviewed at commit `f08f0f3b86acfd628b32baf1275f136c719069e8`.

## Report and evidence

- [Full searchable HTML report](2026-10-28-access-point-data-audit.html):
  findings, source links, record identities, proposed corrections, all 397
  access records, and related POI/campground/link inventories. Download and
  open locally to use the filters; it has no external script or style dependencies.
- [Machine-readable findings](2026-10-28-access-point-data-audit-findings.json):
  all 25 findings, confidence, priorities, affected records, and source/code links.
- [Verification evidence](2026-10-28-access-point-data-audit-evidence.json):
  coverage, 84 access API results, parity differences, database validation
  output, and 24 incorrect shower listings.

## Coverage

The review covered 397 access records across 28 rivers, 53 POIs, 34 NPS
campgrounds, 203 nearby services, and 25 explicit access/service links.
The 25 active rivers contain 359 access records: 325 approved and 34 pending.
Of the approved records, 315 are selectable endpoints and 10 are non-endpoints.
The remaining 38 records belong to three inactive rivers.

All 84 access API requests succeeded: full web, compact mobile, and default
endpoint-only responses for each river. Approved IDs and compared access fields
agreed between the full and compact responses; default responses correctly
excluded non-endpoints. The offline bundle contained 325 access records across
25 rivers, with one observed access-role discrepancy at Grubb Hollow.
Seven additional public requests covered the offline bundle and Current,
Jacks Fork, and Buffalo POI/service responses.

This is a point-in-time database, API, code, and authoritative-source review.
It does not establish installed-device behavior, physical launch suitability,
or current operator permission. No end-to-end browser rendering or installed
iOS device verification was completed.

## Alley Spring correction

The existing selectable access record mixes campground/launch data with
mill-focused naming, description, parking, and imagery. Preserve its identity
and valid access data while correcting the destination it describes.

| Record | Proposed treatment |
| --- | --- |
| Access `8618c6f4-cbd1-44c6-aa4e-c41f500b732a`, slug `alley-spring` | Display **Alley Spring Campground**. Preserve the UUID, public slug, river mile, route references, campground association, and valid facilities. Replace mill-specific prose, parking instructions, and hero image with campground/launch content. |
| Campground service `6c08fb8c-41e5-48e3-812c-8602acf40704` | Resolve its trip-planning action to the existing access UUID. Verify the launch and parking entrance before changing coordinates or link semantics. |
| NPS campground `40fccc16-01c0-4450-88c6-9da1bdaf3186` | Retain the campground association; its center coordinate is not a verified launch coordinate. |
| Spring/mill POI `ed86133d-8f23-4386-b5d4-cc10620ad728` | Keep as a separate landmark. Resolve web/mobile visibility separately from launch eligibility. |

The campground service and access pin are approximately 373 m apart and linked
as `located_at`. That does not establish a shared arrival point. Do not merge
their coordinates or change the link to `same_place` without verification.

## Main findings

| Findings | Discrepancy or review candidate |
| --- | --- |
| F01–F04 | Alley Spring mixes campground and mill identity; its landmark visibility differs across API paths. Pulltite Spring identifies a campground/launch. Greer Spring identifies Greer Crossing and has incorrect agency/classification data. |
| F05–F07 | Four previously prepared spring/cabin corrections remain unapplied. Devils Well is an inland landmark marked on-water. Rocky Falls is assigned as an on-water Jacks Fork stop despite its tributary location. |
| F08–F09 | Grubb Hollow loses its campground role in the offline bundle. The services converter infers showers from potable-water data, producing 24 incorrect shower listings. |
| F10–F15 | Review Cowskin launch eligibility, public/private flags, the lower Big Piney corridor, Mammoth Spring launch claims, Salvation Army Camp naming, and possible Van Buren duplicates. Some are confirmed conflicts; others require verification before edits. |
| F16–F18 | Eight `same_place` links exceed 300 m. Campground counts, fees, and reservation prose conflict with sources. Several descriptions mix mile systems without labeling their reference points. |
| F19–F21 | Two quoted mileage segments fail database validation. Four access pins have unexplained river offsets over 300 m. Some primary types and role arrays disagree. |
| F22–F25 | NPS sync can overwrite reviewed classifications/flags. The catalog has substantial descriptive and arrival-data gaps. Several names need clearer destination identity, and ramp/landing roles require site-specific review. |

The JSON and HTML distinguish confirmed problems from candidates; the table
above is an index, not authorization for a bulk data rewrite. The full report
also records the out-of-scope Jacks Fork gauge-threshold validation error.

## Correction order and safeguards

1. Correct Alley, Pulltite, and Greer identities while preserving stable access
   IDs and valid route data. Verify arrival instructions and images.
2. Apply the four already prepared POI repairs through the guarded
   `repair-spring-classifications.ts` workflow after checking current rows.
   Resolve Devils Well, Rocky Falls, and Alley landmark visibility separately.
3. Correct shower mapping and offline role enrichment; test web, compact API,
   offline bundle, and refreshed mobile data. Address NPS sync recurrence risk.
4. Verify ownership, endpoint eligibility, duplicate candidates, and arrival
   locations before editing the remaining records.
5. Reconcile campground details and fill descriptive gaps from appropriate
   sources, keeping launch/day-use fees distinct from camping fees.

Do not blanket-enable all non-endpoints: boat-in camps and other non-launch
destinations can be correctly excluded. Cross-river and opposite-bank records
can represent distinct valid accesses. Private access may be usable with
permission. Editorial river miles can use a different datum from geometry;
do not replace them wholesale with calculated distances. Known, explained
offsets at Buffalo City and Ha Ha Tonka are not automatic coordinate defects.

This report supersedes older point-in-time observations only where it records
new live evidence. A historical migration or prepared repair is not evidence
that current production data is correct. Implementation, device verification,
and release remain separate from this audit.
