# Tailwater review — October 15, 2026

Evidence review by Codex, authorized by Evan's “lets do all 4”. This records
research and prepared corrections, **not river activation approval**. All three
rivers remain inactive. No device acceptance is claimed.

## Dam recovery and monitoring

- PR #1528 merged and deployed. Its first scheduled production history run,
  `b5d11e7e-2003-482a-9cae-a39670f21c1f` at 22:25 UTC, reached **36/36 streams**
  and wrote 1,688 hourly rows. The previous run reached 16.
- The new monitoring correctly reported **partial**, with 30/36 streams healthy.
  Both metrics on Center Hill, Dale Hollow and Wolf Creek last had an hourly
  history bucket at 16:00 UTC. The 22:35 snapshots carried observations at 17:00
  UTC. Do not mark the entire fleet healthy just because discovery recovered.
- A direct CWMS read later returned 22:00 UTC observations for Wolf Creek;
  Center Hill and Dale Hollow still ended at 17:00 UTC. This is upstream
  publication lag on those explicit series, distinct from the repaired catalog
  rejection. The next history pass can repair the window when it is published.
- The earlier recovery backfilled 754 missing rows. No missing hour remained in
  the inspected outage window for the 20 affected streams. Retention upstream
  is finite; this does not promise indefinite recoverability.
- PR #1530 extracts verified dam recovery from #1479. It requires positive
  per-dam evidence, all expected metrics, and the stalest metric to be healthy.
  Missing, partial, invalid/future and snoozed findings retain their guards.
  Reconciliation anomalies no longer count as data findings.

## Proposed launch scopes

| River | Candidate boat corridor | Scope and decision |
| --- | --- | --- |
| Norfork | Dam-Quarry Boat Ramp → Norfork #1, east bank of the White | First pilot. Correct the confluence continuation before activation. Bill Ackerman is not an accepted boat endpoint. |
| White | Bull Shoals-White River State Park Ramp → White Hole Access | Proposed next pilot, stored miles 1.50–7.28. Does not approve all pairs on the 90.46-mile catalog reach. |
| Taneycomo | Shepherd of the Hills Hatchery **Boat Ramp** → Cooper Creek Access | Proposed third pilot, stored miles 1.04–5.99. Hatchery bank fishing is a separate place. Lower-lake and Powersite approaches require their own review. |

Activating a river currently exposes its catalog endpoints. White and Taneycomo
need either a reviewed publication scope or acceptance of their wider endpoint
sets. A short proposed corridor alone cannot authorize the entire river.

## Access evidence

The companion [36-row evidence extract](tailwater-access-evidence-2026-10-15.json)
records stored pins, snap distances and matched official features. Agency map
symbols establish facility identity, not today's operating condition. Maps with
older fishing-zone labels are used for geography only.

| Item | Verified evidence | Correction or remaining work |
| --- | --- | --- |
| Dam-Quarry Boat Ramp | AGFC feature 1586 at 36.246086, -92.244154; Recreation.gov facility 232565 confirms on-site boat ramp | Pin agrees within about a metre; retain. Correct campground link to the facility page. |
| Bill Ackerman River Ridge | AGFC 2831 is **parking**, 479 is a fishing pier; Norfork map labels walk-in access | Existing pin is the parking area. Set float endpoint false pending verified carry-out permission and practical landing; retain fishing access. |
| Norfork Access | AGFC feature 98, Norfork #1 boat ramp, 36.209421, -92.289682 | East-bank ramp is on the White downstream of the confluence. West-bank feature 302 is a different launch. Clarify bank and route. |
| White agency ramps | 22 stored ramp/access pins match AGFC boating features, including Gaston's (216) and Boswell (2008) | Do not infer private ownership from the Gaston's resort name; AGFC lists this ramp as agency-owned. Facility match is not a complete route hazard review. |
| Bronie Yurkonis | AGFC 944 explicitly says Walk-in Access, County-owned | Exclude from float endpoints until boat access is verified. |
| Roundhouse Shoals | Existing dossier identifies walk-in access; no matching boat feature established | Exclude from float endpoints pending evidence. This is not a claim that carrying a boat is legally prohibited. |
| Hatchery bank access | MDC map distinguishes fishing stairs/bank access from the downstream boat ramp | Exclude the bank row from float endpoints. |
| Hatchery Boat Ramp / Cooper Creek | MDC boat-ramp features 28 / 26 match stored coordinates; MDC says Cooper is five miles below the hatchery | Stored distance is 4.95 miles. Both remain candidates pending photos, posted restrictions and field/device acceptance. |
| Rockaway Beach | MDC boat-ramp feature 518 matches the stored pin | Its 214 m channel snap does not establish a bad ramp pin. Keep the verified pin; review shoreline connection separately. |
| Branson City Ramp / Empire Park | Existing municipal/operator source leads | Exact current restrictions, Empire ownership and lower-lake/Powersite approach remain unconfirmed. No coordinate move or activation approved. |

All 36 access rows lacked photos in the reviewed production inventory. No stock
or generated image has been substituted for a real endpoint-identification photo.

## Norfork geometry correction

The stored Norfork endpoint is `[-92.289813, 36.210834]`, exactly on the stored
White line: **zero confluence gap**. Norfork #1 is downstream. The proposed
continuation follows the existing NHD-derived White bend through
`[-92.290645, 36.210395]` to its ramp station
`[-92.290387783, 36.209253598]`.

Read-only PostGIS preview found a valid, simple joined line, 0.135474 miles of
additional channel, and a 66.44 m ramp-to-channel snap (previously 158.05 m to the
truncated Norfork line). Stored manual mileage becomes **5.01**, preserving the
existing 4.87-mile confluence reference; Dam-Quarry → takeout becomes **4.57 mi**.
The simplified line's geodesic length is different (4.90 mi after extension);
do not silently replace all manually maintained access miles with that length.

The generator now carries the reviewed continuation, with a 10 m join tolerance
and a short-extension bound. Tests reject reversed/disconnected/oversized
continuations. This prevents a future regeneration from dropping the takeout.

## Regulations and river characteristics

Norfork's blanket “catch-and-release from end to end” text is outdated. The July
2026 AGFC update describes limited rainbow-trout harvest, with separate section
and tackle restrictions. Prepared public copy points to current agency regulations
instead of embedding an easily stale whole-river rule. The older `/TroutRegsNews`
redirect still leads to an October **2025** emergency order; it is not the latest
2026 rule source. Similarly, the Dam-Quarry closure found in search was October
7–19, **2025**, not an established current closure.

Prepared descriptions remove fixed-flow wading assurances, a permanent 185-cfs
promise and unqualified claims about hourly/eight-foot changes. Structured
characteristics describe cold water, changing releases and the distinction
between an observation at a dam and downstream conditions, using the existing
`cold_water` and `fluctuating_flow` hazard keys. Each `river_note` is one
sentence drawn from the reviewed description, because condition cards append it
to the reading text and Eddy's prompt reads it. No recreational
threshold, travel-time curve, safe departure window or wading classification is
introduced. Fixed-hazard coverage and posted dam approach limits remain pending;
zero hazard rows never means hazard-free.

## Provider and presentation review

Production primary-provider mappings are Norfork → `swl-norfork-dam`, White →
`swl-bull-shoals-dam`, Taneycomo → `swl-table-rock-dam`, all USACE, cfs, with no
optimal-band thresholds. Their 22:35 UTC snapshots contained fresh release,
turbine and stage observations dated 22:00 UTC. USACE reads use their provider
path; an empty `gauge_latest` row is not by itself a failed USACE feed. White also
has downstream USGS stations and the Norfork release reference; Bull Shoals
alone cannot describe the whole lower river.

Existing registered tests exercise missing/stale observations, dated stage
movement, no all-clear for wading, and withheld float times. Web and iOS
`TailwaterStatusRow` both consume `shared/tailwater-status.ts`. MCP `plan_float`
warns about dam control, and duration searches withhold regulated-river results.
These are code checks, not an end-to-end device acceptance record.

Before activation, record this matrix on web and an iOS build and inspect MCP
responses for the selected real river:

| Scenario | Required observable result |
| --- | --- |
| Missing release/turbine reading | Unavailable, not zero or idle; no float-time estimate |
| Stale reading | Age retained; no claim about current generation or stage movement |
| Schedule says idle, observation shows generation | Observation and schedule retain separate labels/timestamps; no safe-window claim |
| Unexpected release or stage change | Report measured change with its own timestamp; do not infer travel time or a safe threshold |

Remaining acceptance evidence: identifiable endpoint photos, current posted
restrictions, fixed-hazard review, route-scope enforcement where needed, and the
web/iOS/MCP walkthrough. The generic activation RPC remains unchanged and still
refuses `dam_tailwater`.

## Applying the prepared corrections

[tailwater-corrections-2026-10-15.sql](tailwater-corrections-2026-10-15.sql) is an
atomic DML transaction pinned in its header to project `ilefwfpvphadsbptiaur`.
It checks inactive river identities, previous prose, access identities and the
confluence before changing anything. It ends in `ROLLBACK` for preview. After a
successful preview, the authorized apply changes only the final statement to
`COMMIT`; rerun and verify the resulting rows. It does not activate a river or
change condition thresholds.

Two connector attempts to run the rollback preview returned `Invalid or expired
requestState`; a subsequent read confirmed the original 4.87-mile Norfork and all
three inactive flags. **No production correction is claimed.** The independent
read-only geometry preview and the source research succeeded. Full transaction
execution/post-write checks are still required when the write connection works.

## Primary sources checked

- [AGFC public-use facilities GIS](https://gisec2.agfc.com/arcgis/rest/services/GIS/AGFC_DATA/MapServer/1)
- [AGFC Norfork map](https://www.agfc.com/wp-content/uploads/2023/05/tp_norforktailwater2010.pdf)
- [AGFC upper White map](https://www.agfc.com/wp-content/uploads/2023/05/bull_shoals_lake_tailwater.pdf)
- [AGFC lower White map](https://www.agfc.com/wp-content/uploads/2023/05/bull_shoals_lake_tailwater_continued.pdf)
- [AGFC July 2026 regulations update](https://www.agfc.com/news/arkansas-2026-27-fishing-regulations-changes-in-effect-new-guidebook-released/)
- [Dam-Quarry, Recreation.gov](https://www.recreation.gov/camping/campgrounds/232565)
- [MDC boat-ramp GIS](https://gisblue.mdc.mo.gov/arcgis/rest/services/Aquatic/MO_Fishing_Interactive_Map/MapServer/0)
- [MDC hatchery map](https://mdc.mo.gov/sites/default/files/2024-04/5601map_0.pdf)
- [MDC hatchery page](https://mdc.mo.gov/discover-nature/places/shepherd-hills-conservation-education-center)
- [MDC Cooper Creek](https://mdc.mo.gov/discover-nature/places/cooper-creek-access)
- [MDC Lake Taneycomo conditions and fishery](https://mdc.mo.gov/fishing/fishing-prospects/areas/lake-taneycomo)
