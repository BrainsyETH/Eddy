# Illinois River (OK) access points: Phase 8 review packet, 2026-11-02

Data file: [`../illinois-river.json`](../illinois-river.json), 15 rows (14
public sites plus one private launch candidate, Highwater Camp).
Nothing has been imported or written to any database. This packet records the
evidence and the checks a reviewer should make before running
`import-dossier-access-points.ts illinois-river --write`. Run `--approve` only
after those checks.

**Summary:**
- **7 rows carry coordinates:** 6 launches plus the Chewey Bridge landmark.
- **8 are held** (`lat/lon: null`), including the private Highwater Camp
  launch. One of them, Horseshoe Bend, has a verified coordinate; it is held
  only because it lies below the stored river line.

## How positions were measured

- **Line:** the dissolved TNM/NHD Illinois River line, 148.7 mi from the AR
  headwaters, with mile 0 at the headwaters.
- **Measurements:** `@turf/turf` `nearestPointOnLine` for the mile, and
  `pointToLineDistance` for the offset.
- **The stored line now ends at the Baron Fork mouth, Eddy mile 108.70.**
- **`expected_mile` = GRDA river mile + 47.2,** rounded to 0.1. The local
  offset varies:

  | Reach | Local offset |
  |---|---|
  | Round Hollow | ~47.7 |
  | US-62 | ~46.75 |
  | Below Baron Fork | ~46.2 |

  River-mile order is unaffected.

## New source found in this pass: GRDA's own site coordinates

GRDA's float-permit and camping store (linked as "Float Permits & Camping
Reservations" from <https://grda.com/illinois-river/>) runs on RentMy at
<https://grda.rentmy.co/>. Each access-area product carries a GRDA-entered
`option-lat-long` custom field. Each numbered campsite carries its own
latitude/longitude.

- **How they were read:** through the store's public client API
  (`clientapi.rentmy.co/api/products/custom-fields/values/<id>` and
  `/api/assets/by-products`). This is the same call the store's campsite map
  makes, using the token embedded in the public page.
- **Coverage:** only four Illinois River areas are in the store: Round Hollow,
  Peavine Hollow, No Head and Todd. Stunkard, Edmondson, Echota, Watts and
  Carnes Ford are not.
- **Independence from AW:** the products were created around April 2026
  (image timestamps). AW's reach points predate them (howsyourriver.com shows
  the AW data as "updated 10 months ago"), so the two are independent.

| Product id | Store name | Store URL slug | Site coordinate | Campsites |
|---|---|---|---|---|
| 226604 | Round Hollow Public Access Area | `round-hollow-public-access-area` | 36.094796, -94.830888 | 28 (R-1…R-28) |
| 226605 | Peavine Hollow Public Access Area | `peavine-hollow-public-access-area` | 36.064504, -94.884363 | 6 |
| 226606 | No Head Public Access Area | `todd-public-access-area` (sic) | 35.965641, -94.910722 | 3 |
| 226607 | Todd Public Access Area | `todd-public-access-area-1` | 35.958788, -94.869116 | 3 |

**Corroboration source.** American Whitewater's reach 4460 page embeds
per-access points (`pointOfInterests`) with coordinates and bank. These are
independent, but not agency data.

## Per-site record

Measurements use each row's coordinate, or the best lead for held rows.
"Off line" is the distance from the dissolved line.

### Verified pins (6 launches + 1 landmark)

| Site | Pin (lat, lon) | Eddy mile (measured / expected) | Off line | Authoritative source | Corroboration | Confidence |
|---|---|---|---|---|---|---|
| Watts PAA (US-59) | 36.12926, -94.57218 | 50.41 / 50.3 | 52 m | NBI 281960 + 282160 (US-59 NB/SB; ODOT-owned). GRDA rule names it "US 59 Illinois River Bridge Crossing Access Area" | AW "Watt Public Access Area at Highway 59 Bridge", river right, 114 m N; OSM bridge ways 233808327/233808329 | medium |
| Chewey Bridge (landmark, not endpoint) | 36.104417, -94.783772 | 70.98 / 70.8 | 70 m | NBI 136820 (Chewey Rd/E0630, county-owned) | OSM bridge way 233785862, 3 m; AW river-left access, 110 m | high (bridge position) |
| Round Hollow PAA | 36.094796, -94.830888 | 75.41 / 74.9 | 57 m | GRDA reservation system, product 226604 | AW, 29 m. **GNIS node 357403692 is 277 m S** | medium |
| Peavine Hollow PAA | 36.064504, -94.884363 | 79.67 / 79.6 | 64 m | GRDA product 226605 | AW, 28 m; GNIS node 357401613, 28 m | high |
| No Head Hollow PAA | 35.965641, -94.910722 | 88.94 / 88.7 | 99 m | GRDA product 226606 | AW, 26 m; GNIS node 357399759, 56 m | high |
| Todd PAA | 35.958788, -94.869116 | 94.31 / 94.2 | 58 m | GRDA product 226607 | AW, 39 m; North Oakdale Dr (OSM way 14707415) ends at the pin | high |
| US-62 Bridge Access | 35.92645, -94.92502 | 101.85 / 102.3 | 107 m | NBI 250090 + 250110 (US-62, ODOT-owned). GRDA rule names it "US 62 Bridge Access on the Illinois River" | OSM bridge way 164654141, 27 m; AW access, 70 m E | medium |

The six launches are, in river order: Watts, Round Hollow, Peavine, No Head,
Todd and US-62. River-mile order is monotonic.

### Held rows (`lat/lon: null`)

| Site | Expected mile | Best leads (measured mile, off line) | Why held / what is missing |
|---|---|---|---|
| WOKA Whitewater Park | 49.8 | AGFC layer objectid 25308, 36.130578, -94.562524 (49.84, 38 m); AGFC water-trail page 36.133889, -94.566111 (49.95, 435 m); AW put-in 36.13201, -94.56405 (49.93, 200 m) | Three sources are 210–489 m apart. The official site gives only an address (474986 Twin Falls Rd). Excluded as an endpoint anyway. |
| Carnes Ford PAA | 57.6 | AW 36.14117, -94.666928 (57.77, 18 m); OSM ford node 8968644307, 30 m from AW | Both sources are non-agency. They agree closely, so a GRDA or ODWC coordinate, or an imagery check of the slab crossing, should promote it. Highwater Camp's maps page says the low-water crossing "is still washed out"; confirm current road access with GRDA. |
| Highwater Camp River Access (private) | 59.0 (GRDA mile 11.8 in the 2025 guide) | Operator's Google Maps link: business place pin 36.1536671, -94.6814357 (59.04, 135 m), on private service road OSM way 14649285 | The launch is "directly on the gravel bar at HWC" (RAP page), but no source fixes the bar. The place pin is a business marker, not the launch. Needs an imagery-verified pin on the gravel-bar entry, or one from the operator. Modeled like the Elk private launches: `is_public: false`, `Private`, `fee_required: true` (the $10/vehicle/day RAP plus a GRDA float permit per boat; campers exempt from the RAP; May 1–Nov 15; 5 passes a day). |
| Stunkard PAA | 75.2 | AW 36.088687, -94.837319 (75.97, 106 m) | Single non-agency source. It sits 0.56 mi below GRDA's Round Hollow pin; GRDA's mileage says 0.3 mi. |
| Edmondson PAA (Combs Bridge) | 83.4 | AW 36.031363, -94.912292, river left (83.44, 105 m); NBI 308360 Combs Bridge (N4545, built 2015) 36.032222, -94.911111 (83.39, 10 m) | No agency coordinate for the access. GRDA's mileage puts Edmondson 0.3 mi above "New Combs Bridge"; AW puts it 143 m from the bridge. |
| Echota PAA | 100.4 | GNIS node 357391240, 35.9437019, -94.9141214 (100.21, 98 m); AW "Echota Bend" 35.942703, -94.911419 (100.11, 71 m) | No agency coordinate, and the two leads are 267 m apart. |
| Murrell Home Rd Public Access (USACE) | 109.2 (true position ≈108.2) | none | Absent from the USACE Tulsa District recreation-features service, the USACE recreation-area polygons, recreation.gov, AW and OSM. Needs a USACE Tenkiller office source (918-487-5252). |
| Horseshoe Bend PUA (USACE) | 112.8 | **Verified:** USACE SWT boat ramp 35.821418, -94.903206 (111.79, 57 m); AW take-out 58 m; GNIS node 357395037, 40 m | Held only because it is below Baron Fork, inside Tenkiller Ferry Lake, and off the stored line. Restore lat/lon if the river is extended. |

## Source disagreements over 100 m

1. **Round Hollow: GRDA vs GNIS, 277 m.** GRDA's pin sits among GRDA's 28
   numbered campsites, and AW's point agrees within 29 m, so the pin follows
   GRDA. The GNIS point (OSM node 357403692) is a 2009-era names-database
   centroid south of the campground. Confidence is medium on this account.
2. **Watts: NBI bridge vs AW launch, 114–126 m.** These are different
   features: the bridge deck and the launch "at the bridge on river right".
   The pin is the bridge (agency source); the reviewer should move it to the
   parking/launch.
3. **Chewey: NBI bridge vs AW river-left access, 110 m.** These are also
   different features. The row is a landmark and the pin is the bridge.
4. **Edmondson: AW vs NBI Combs Bridge, 143 m.** GRDA's mileage spacing
   (0.3 mi) disagrees with both. Held.
5. **Echota: GNIS vs AW, 267 m.** Held.
6. **Stunkard: AW vs GRDA mileage.** AW puts it 892 m below Round Hollow
   against GRDA's ~480 m (0.3 mi). Held.
7. **WOKA: three sources 210–489 m apart.** Held.
8. **NBI US-62 record geometry vs its own lat/long fields, 220 m.** The pins
   use the record's LAT_016/LONG_017 fields. Those agree with OSM's bridge
   (27 m). The feature-service point geometry for 250090 sits off the river.

Not on the river but noted: for Carters Landing, the recreation.gov boat-ramp
point and the USACE SWT ramp feature are 890 m apart.

## What the reviewer should check on imagery

| Site | Check |
|---|---|
| Watts | Find the GRDA parking/launch on river right at the US-59 bridge. AW's point is at 36.130173, -94.571497, near the USGS gauge house. Move the pin there if that is the lot, and confirm it is GRDA's area rather than the WOKA lot upstream. |
| Round Hollow | Confirm the gravel launch/bar sits near the GRDA pin (OK-10 at North Round Hollow Rd) and not 280 m south at the GNIS point. If the launch is distinctly separate from the campground, move the pin to the gravel-bar entry. |
| Peavine Hollow | The pin is 27 m from OK-10. Confirm the lot and river-right gravel access. |
| No Head Hollow | Confirm the lot beside OK-10 and the river-right access; the pin is 99 m from the line, within the 250 m snap limit. |
| Todd | Confirm the river-left access at the end of North Oakdale Drive and that the road is public to the gate. |
| US-62 | Identify which bank holds the GRDA access lot. AW's point (35.926302, -94.924289) is east of the bridge. Move the pin off the deck onto the lot. |
| Highwater Camp (held) | Find the HWC gravel bar near the end of the private road from 599th Road, around 36.153, -94.682 (river right, about Eddy 59.0). Pin the vehicle entry onto the bar, not the place marker. Confirm with the operator (JDart@Highwatercamp.com) before giving the row coordinates. |
| Chewey Bridge | No action; landmark only. Do not promote it to an endpoint without evidence of public launch rights. |

For each held row, a single GRDA or USACE coordinate, or the reviewer's own
imagery-verified pin with a stated basis, promotes it. Carnes Ford and
Edmondson are the closest to promotion.

## Sources consulted

- GRDA: <https://grda.com/illinois-river/>;
  [2025 guide](https://grda.com/wp-content/uploads/2025/06/Illinois-River-Guide-and-Map-2025-final.pdf)
  (not a GeoPDF: no LGIDict or GPTS);
  [OAC 300:40](https://grda.com/wp-content/uploads/2024/06/Title-300-Chapter-40-SRO2023wAppendix.pdf);
  store <https://grda.rentmy.co/> (products listed above).
  - GRDA's ArcGIS organization (`3pkimX8WBjhEA54V`) holds only utility layers.
  - `stormops.grda.tech/riveroperations` covers Grand Lake hydro operations,
    not the scenic rivers.
- USACE Tulsa District recreation features:
  <https://services8.arcgis.com/GvI5dZtQIoT0Fznq/arcgis/rest/services/District_Recreation_Features_SWT/FeatureServer>.
  Layers 11 (Boat Ramps) and 31 (Parking Areas) cover Horseshoe Bend, Etta
  Bend and Carters Landing only; there is no Murrell Home, Boy Scout Hole or
  Welling Bridge.
- USACE recreation areas:
  <https://services7.arcgis.com/n1YM8pTrFmm7L4hs/arcgis/rest/services/usace_recreation_areas/FeatureServer/0>.
- recreation.gov search: Tenkiller ramps only, and nothing upstream of
  Carters Landing.
- FHWA/BTS NBI:
  <https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0>.
  Six Illinois River structures in the corridor: 281960, 282160, 136820,
  308360, 250090 and 250110.
- ODWC ArcGIS organization (`jRf8jjFwxedITdFe`): WMA boundaries,
  OLAP and special-use areas only. No river access areas are published; only
  the Sparrowhawk, Barren Fork and Bamberger WMAs fall in the corridor.
- USGS PAD-US fee managers: no access-area parcels.
- GNIS: the current OK DomesticNames file no longer carries the park points.
  The legacy points survive as OSM GNIS-import nodes.
- American Whitewater reach 4460:
  <https://www.americanwhitewater.org/content/River/view/river-detail/4460/main>.
- OpenStreetMap API 0.6 map extracts around each site: no `amenity=parking`
  or `leisure=slipway` at any GRDA site; TIGER-grade roads only.
- Wayback Machine (for archived OSRC pages): connection reset from this
  container, so not used.
