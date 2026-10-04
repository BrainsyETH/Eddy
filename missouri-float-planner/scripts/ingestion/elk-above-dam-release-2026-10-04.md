# Elk: concrete above-dam release preparation

Status: **database changes applied; Elk inactive; private pins unapproved**.
Presentation depends on #1418 and this PR being deployed. The accepted
product choice is measured Noel stage in feet without recreational ratings.
No operator contact or field visit is claimed.

## Applied database changes and prepared presentation

- Applied migration `20261004044139_stage_elk_noel_unrated_release.sql` switched the exact
  reviewed Tiff link to an empty-ladder Noel primary and curated Noel. Tiff's
  station, history and stars remain; its six historical anchors/provenance are
  archived in `elk-tiff-threshold-archive.json`.
- Cowskin stays an approved public listing but is no longer a float endpoint.
  Existing server endpoint validation rejects it, including direct ID requests.
- The river stays inactive. The section description/bounds now name the initial
  above-dam corridor. The migration refuses an active river, missing cleanup,
  unexpected gauge changes or any remaining eligible endpoint at/below the dam.
- The access dossier carries three **pending, non-endpoint** bank candidates,
  private-access terms, address handoffs and parking instructions. Its importer
  now preserves these supplied fields without changing approval/endpoint intent.
- The Trestle low-water road crossing is mapped at mile 6.52 by applied migration
  `20261004045234`. Its position is imagery-derived; passage/portage remains
  unspecified. `elk-trestle-crossing.json` records the sources and placement.
- Planner, chat and MCP include only low-water dams within 0.5 miles below the
  take-out in a separate `damsBelowTakeOut` field. Web, iOS and saved iOS details
  render “Below your take-out.” These do not affect trip distances, times,
  warnings or in-route portage counts. Old browser plan caches refresh.
- The dossier has an explicit `unrated` conditions review; operational evidence
  remains blocked where deployment or exact endpoint review is outstanding.

## Bank candidates to review

Coordinates are imagery-derived candidates, not surveyed or operator-confirmed
pins. USGS georeferenced imagery was compared with the owner's October 3 maps,
operator property maps and the operator's linked location addresses. The USGS
service contains older NAIP imagery; agreement with a river line is a placement
check, not proof of the current launch. `elk-access-candidates.geojson` retains
image extents, selected pixels, coordinates, approximate uncertainty and notes.

| Candidate | Bank coordinate (lat, lon) | Eddy mile / distance to line | Address for road handoff | Specific remaining check |
|---|---|---|---|---|
| Kozy Kamp | 36.58841, -94.38950 | 0.43 / 28.6 m | 71 Elk River Road, Pineville | Verify the track's water-entry point and designated parking; owner's 36.588894, -94.389059 pin is a land approach |
| Trestle Park | 36.58521, -94.45495 | 6.55 / 28.3 m | 435 Elk Springs Road, Noel | Candidate is the downstream beach beside the low-water crossing. Confirm which side each trip uses and the passage/walk between them |
| Wayside | 36.54897, -94.49429 | 11.33 / 47.8 m | 201 Minnow Springs Ave, Noel | Verify the current landing and parking path within the designated beach, before the operator's no-watercraft boundary |

All three candidates project above the stored dam at mile 11.61. Candidate route
lengths are 6.12, 4.78 and 10.90 Eddy miles. Do not replace those geometry-derived
lengths with the operator's advertised 6/6/12-mile names. Verify actual endpoint
routing once pins are approved. Noel's stored location projects to mile 11.32.

Operator evidence:

- [Trips and durations](https://www.elkriverfloats.com/float-trips/)
- [Kozy trips/check-in](https://kozykamp.com/float-trips)
- [Trestle campground](https://trestlepark.com/elk-river-campground) and
  [property map](https://img1.wsimg.com/isteam/ip/4c611e4a-7b28-4d91-afd7-9f1102df1c5e/A03155FD-7BDD-4057-AC0A-4D251F844CB9.jpeg)
- [Wayside camping](https://waysidecamp.com/camping) and
  [property map](https://img1.wsimg.com/isteam/ip/d1802747-9892-43c9-a0c8-d379822f4274/WS%20Map.jpeg)
- [Paid personal-boat access terms](https://waysidecamp.com/rates): one-location
  and two-location passes are published; availability/prices must be checked.
- [USGS imagery service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer)

## Sourced typical times, ready for endpoint linking

These are operator trip ranges, not modeled current-water times. They are now
recorded in the dossier. The generic speed estimate should be replaced by these
exact-pair records once the corresponding endpoints are approved and linked.
No numerical range was widened by guesswork.

| Advertised trip | Canoe/kayak | Raft | Tube |
|---|---|---|---|
| Trestle → Wayside (Noel, 6 miles) | 3–6 h | 4–8 h | 6–8 h |
| Kozy → Trestle (upper, 6 miles) | 4–6 h | 4–6 h | No duration sourced |
| Kozy → Wayside (12 miles) | 6–8 h | Not offered in this product | Not offered in this product |

The [operator trip page](https://www.elkriverfloats.com/float-trips/) publishes
these ranges/products. Upper-trip seasonality remains operator-managed; Noel
stage does not make an opening or closure decision for these trips.

## Remaining release sequence

1. Review/merge #1418 and this preparation PR. Deploy the web/API status behavior;
   include iOS presentation in the next app build/update.
2. Completed: cleanup `20261004044101`, policy `20261004044114`, transition
   `20261004044139`, access-field support `20261004044150`, and crossing
   `20261004045234` are applied. Filenames/ledger match production; types are
   regenerated. `make check-db` is blocked by the workspace tsx IPC/CLI setup
   and unlinked CLI checkout. The same repository ledger functions were run
   against connector-fetched production history with no drift. The already
   merged Apple migration `20261004034340` is copied unchanged from main so this
   stacked branch includes the full applied history.
3. Confirm Noel's curated poll writes `gauge_readings` (not just `gauge_latest`),
   including the observation timestamp. No recreational condition-change alert
   or condition-driven Eddy update is promised for an unrated gauge.
4. Review the concrete bank/road candidates under the existing
   `scripts/ingestion/README.md` coordinate-review process. Import pending rows;
   approve endpoint intent only after review. Then link exact-pair trip times.
5. Apply the already-prepared campground/service CSVs from #1412; inspect their
   previews and read-back. The confluence POIs were applied with cleanup. The service batch has
   seven existing listings and three additions. Business pins are not launch pins.
   No verified mainstem spring stop was found; do not create one from a tributary
   name. Photos without reuse rights stay excluded; booking availability feeds
   are not asserted for private campgrounds.
6. Test the actual three private route pairs and road handoffs. Check Cowskin
   rejection via plan, shuttle and save paths, then complete the remaining
   dossier reviews, owner signoff and atomic activation preview before release.

The operator's Noel thresholds and pool-influence answers are needed for a
future **rated** release. They are not prerequisites for publishing raw readings.
The specific Trestle passage/landing question remains an endpoint-routing item.
The full launch requires the three private route pairs. A public-only fallback
is not the chosen release: Pineville (0.26) → Mount Shira (7.78) also passes the
crossing.

### Endpoint questions for the operator

1. Does Trestle use the downstream/right-bank beach candidate for both upper-trip
   landings and Noel-trip launches? How do upper/12-mile guests pass or carry at
   the crossing, and where is any permitted carry route?
2. Confirm Wayside’s exact landing, parking path and no-watercraft boundary;
   confirm Kozy’s water-entry track and check-in/parking location.
3. Confirm the Noel trip’s actual start/end points behind its advertised six
   miles. Current Eddy miles differ by 4.78; check both the pins and line/mileage
   before linking its operator times. Do not force the measured distance to six.

**Correction from the first draft:** river direction and PostGIS projections put
Trestle’s bank candidate at 6.554, just downstream of the crossing at 6.525
(unrounded), on the right bank. The earlier upstream/left-bank description was
wrong. The existence of the crossing is confirmed by the operator; a legal or
usable passage has not been asserted.

## Verification

PostGIS placement queries were read-only; the listed migrations were subsequently
applied with user authorization. The migration is tested in PGlite with
spatial-function doubles: precondition failures and late failures roll back;
Noel becomes primary/curated, Cowskin loses only endpoint eligibility, Tiff
history survives, and Elk remains inactive. Production read-back confirms these
results, the new crossing, and service-role-only access to the import RPC.
Tiff retains 1,438 history rows. Noel’s first cron-written observation is checked
separately; merely curating a gauge does not prove the job has run.

The access-field RPC migration is exercised with insert/update, omitted-field
preservation, review-state rejection and atomic rollback tests. The CLI access
dry run could not connect because this workspace has no script credentials;
production reads used the connector. Dossier ingestion preview correctly refuses
the unsigned Elk dossier. No guarded client or signoff requirement was bypassed.

Web/test type checks and lint passed; 3,087 tests passed. iOS type checking,
lint, production bundle and archive validation passed. The explicit activation
preview returned only the expected outstanding review criteria and the
pre-poll missing-history warning; it left Elk inactive.
