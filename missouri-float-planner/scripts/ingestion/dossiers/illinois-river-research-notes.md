# Illinois River (OK): research notes, 2026-11-02

Companion to `illinois-river.json` (RESEARCH DRAFT, not signed off). This is Eddy's first
Oklahoma river. The state-level section below is meant to be reused for Barren Fork and
Flint Creek.

## Overall confidence

| Area | Confidence | Why |
|---|---|---|
| Gauges (4 USGS + 3 NWPS LIDs) | **High** | Confirmed via the NWIS site service, the USGS OGC monitoring-locations API and the NWPS API, with fresh readings 2026-11-01 ~23:00 CST. The waterdata.usgs.gov HTML page returned 403 to automated fetch. |
| Rules and regulator | **High** | Primary GRDA documents: OAC 300:40 (eff. 2023-09-11, with Appendix A), 82 O.S. §896.x as compiled by GRDA, and the 2025 GRDA river guide. |
| Corridor and river miles | **High** for GRDA mileage; **medium** for endpoints | GRDA publishes an official river-mile table. AW's mileages agree after a −2.6 mi offset (AW counts from WOKA). |
| Oklahoma access law | **Medium** | Curry v. Hill read in full (Caselaw Access Project). 60 O.S. §338/§60 and AG Op. 78-170 could not be read directly: OSCN is behind Turnstile and counselstack rate-limited. |
| Access coordinates | **None verified** | GRDA publishes no coordinates. Every access point is HELD (`lat/lon: null`), with OSM/GNIS leads in `coordinateNote`. |
| Calibration | **High for the regulatory high end; none for the low end** | See the rated vs unrated section. |

## Oklahoma state-level findings (reuse for Barren Fork and Flint Creek)

1. **Streambed ownership and public use.** The bed of a non-navigable stream belongs to the
   riparian owners to the thread (60 O.S. §338, as applied in *Curry v. Hill*, 460 P.2d 933,
   Okla. 1969). *Curry* found the Kiamichi navigable in fact for fishing and pleasure. It held
   that the bed owner's title is "subject to certain burdens", and that the water is "in the
   nature of a street or highway", so people who reach it "without committing an act of
   trespass" may boat on either side of the thread. Fixing trotlines to the other owner's bed
   was not protected.
   - The holding is fact-specific. I found no Oklahoma case applying it to the Illinois,
     Barren Fork or Flint Creek.
2. **The Scenic Rivers Act overlay (82 O.S. §896.1–896.16).**
   - **Designations (§896.5):** the Illinois in Adair, Delaware and Cherokee counties above
     the Barren Fork confluence; Flint Creek in Delaware County; and Barren Fork in
     Adair/Cherokee from US-59 West to its mouth. Also the Upper Mountain Fork and
     Big/Little Lee Creek.
   - **Landowners (§896.9):** landowners' rights are "the same as in any other area of the
     state", and unauthorized use of private property is trespass.
   - **Access areas (§896.7):** the state may acquire access points only by private treaty,
     never eminent domain.
   - **Containers (§896.8):** glass and foam are banned.
   - **Fees (§896.16):** private vessels pay $1/day or $10/yr. Adjacent landowners are
     exempt.
3. **Authority.** SB 1388 (2016) ended the Oklahoma Scenic Rivers Commission on 2016-07-01
   and moved its powers, assets and staff to the **Grand River Dam Authority** (§896.1). GRDA
   may own and control public access points (§896.3) and adopted **OAC Title 300, Chapter 40**.
   That chapter covers:
   - outfitter licensing, with a 3,900-vessel cap and three commercial float areas;
   - camping (designated sites only, a 7-day limit, quiet hours);
   - alcohol: distilled spirits banned everywhere; beer and wine allowed for 21+ in non-glass
     packaging except at named dry access areas;
   - coolers of 52 qt or less that seal, and no tying vessels together;
   - motors of 10 hp or less, no jet skis;
   - **level-based commercial limits (Appendix A)** and emergency closure authority.
   - The vessel rules in 300:40-4-7 apply on Flint Creek and Barren Fork too, and commercial
     vessels are barred from Flint Creek (Delaware Co.) and Barren Fork (Cherokee Co.).
     That matters for those two dossiers: they will have no outfitter trip menus.
4. **Other actors.**
   - ODWC owns some access-area land. In 2021 it moved to end commercial use at six sites
     (Watts, Round Hollow, Stunkard, Peavine Hollow, No Head Hollow, Echota) because ODWC
     money cannot support commercial activity. The agreement was extended to Feb 2025; its
     status now is unknown.
   - USACE (Tenkiller) runs Murrell Home, Boy Scout Hole and Welling Bridge.
   - The corridor lies within the Cherokee Nation. I found no tribal floating rule.
5. **Practical rule for Eddy (all three OK scenic rivers).** Floating the channel is
   state-sanctioned and permitted. Banks and gravel bars are private outside access areas.
   Endpoints are GRDA/ODWC public access areas, USACE areas, or outfitter landings with
   published terms. Never a bridge by default.

## Recommended corridor and endpoints

- **Corridor.** Watts Public Access Area (GRDA RM 3.1) to Murrell Home Rd Public Access
  (RM 62.0, USACE), about 59 mi.
- **Sections.** Two, split where GRDA's rule switches gauges:
  - **Upper:** Watts → No Head Hollow (RM 41.5), Chewey gauge 07196090.
  - **Lower:** No Head Hollow → Murrell Home, Tahlequah gauge 07196500.
  - The rule's switch point is RM 40 (Diamondhead), a private resort. No Head Hollow is the
    nearest public access below it.
- **Excluded:**
  - WOKA (RM 2.6) and the Lake Frances dam remnant (RM 2.7), until GRDA describes the
    main-channel passage.
  - Everything below the Barren Fork confluence (RM 62.5): Horseshoe Bend and Carter's
    Landing. The Tahlequah gauge omits Barren Fork's 312 sq mi, and the scenic designation
    ends there.
- **Owner choice:** end at US-62 Bridge (RM 55.1, GRDA, dry) instead of Murrell Home if the
  USACE access cannot be confirmed.
- **Gauge positions.** All four OK gauges are **above** the Barren Fork confluence:
  Watts (RM ~3), Chewey (RM 23.6), Moodys (inferred to be near Combs Bridge, RM ~36) and
  Tahlequah. Flint Creek (RM 16.2) enters between Watts and Chewey.
- **Arkansas.** The Illinois is floated in Arkansas. AGFC's *Upper Illinois River Water
  Trail* runs Chamber Springs → Siloam Springs Kayak Park → WOKA (15.5 mi). AGFC rates the
  best level at "200–1,000 cfs" on USGS 07195400 (AR, Hwy 16). Both Siloam Springs Kayak
  Park and WOKA have Class II+ features.
  - Recommendation: **do not** create an AR record. Later, consider extending this river
    upstream as an AR section. That needs Eddy's single-`state` river model to accept a
    two-state river, plus an AGFC-calibrated section on 07195400.

## Rated vs unrated: recommend **unrated (readings-only) now**

The trusted evidence is a **regulatory, gauge-tied ladder in feet**. GRDA OAC 300:40-3-3 and
Appendix A are binding rules that grew out of the Illinois River Association's 1993 outfitter
guidelines, which GRDA also republishes. Diamondhead Resort repeats the Chewey ladder.

| GRDA Appendix A (commercial) | Chewey 07196090 | ≈cfs now* | Tahlequah 07196500 | ≈cfs now* |
|---|---|---|---|---|
| Rafts only for children ≤10 | 5'6" | ~2,290 | 6'0" | ~1,030 |
| Rafts only for everyone; operators must warn of high-water danger | **6'0"** | ~2,800 | **6'6"** | ~1,570 |
| No floating for children ≤10 | 7'0" | ~4,020 | 7'6" | ~3,070 |
| No commercial floating (IRA: "all floating cease") | **9'6"** | ~8,200 | **9'6"** | ~6,920 |
| NWPS action / flood (cross-check only) | 9 / 12 ft | ~7,230 / ~13,700 | 9 / 11 ft | ~5,890 / ~10,200 |

\*My inference: medians of USGS IV stage–discharge pairs, Nov 2023–Nov 2026. These are not
rating-table values; the rating endpoint returned 403. Watts' NWPS flood stage of 13 ft is
about 11,200 cfs.

This would supply `high` (Chewey 6.0 / Tahlequah 6.5) and `dangerous` (9.5 / 9.5), each with
two or more sources. The sources share a lineage (IRA → GRDA → outfitters), so they are not
fully independent. I still recommend unrated, for three reasons:

1. **No trusted low end.**
   - Eagle Bluff's "ideal 3.5–5.5 ft" names no gauge. It cannot be Tahlequah, where the
     3-year minimum stage was 4.42 ft.
   - With only `high`/`dangerous` set, `classifyReading` falls through to **`too_low`** for
     every reading below `high`. Normal summer water (Chewey ~2.5 ft today) would badge
     "Too Low", which is a false verdict.
2. **The meaning of a stage has drifted.** Summer median stage at a fixed flow (my analysis
   of USGS IV data):

   | Gauge | 2008 | 2011 | 2014 | 2017 | 2020 | 2023 |
   |---|---|---|---|---|---|---|
   | Tahlequah @ ~400 cfs | 3.20 | 4.95 | 5.48 | 5.38 | 5.04 | 4.83 |
   | Chewey @ ~250 cfs | n/a | 4.81 | 2.41 | 4.20 (400 cfs: 4.66) | (400 cfs: 4.29) | 2.28 |
   | Watts @ ~400 cfs | 3.01 | 3.27 | 2.94 | 3.44 | 3.01 | 3.07 |

   - Watts is stable. Chewey swings about ±2 ft between years, and Tahlequah stepped up
     ~1.5–2 ft after 2008.
   - A 2010 blog's "2.60 ft / 225 cfs" at Tahlequah fits the old relation.
   - The USGS Chewey station did not exist in 1993 (IV from 2010, daily from 2000), so the
     IRA's "Chewey" number was read on some other gauge.
   - So a 9'6" limit fixed in 1993 has meant very different flows over the years. It is
     still the level GRDA enforces, but its hazard meaning is not stable.
3. **The 2020 fatality happened inside the "high" band, below `dangerous`.** Tahlequah's
   daily mean was 3,730 cfs that day. Danger here is driven more by life jackets and
   obstructions than by a crisp level.

**Cost of unrated.** Between 9.5 ft and NWS flood stage (12 ft at Chewey, 11 ft at Tahlequah)
Eddy shows no Dangerous badge; the NWPS flood-stage override still applies above that.

**Mitigation, for the owner to decide.**
- Surface the GRDA Appendix A limits as **regulation prose** next to the raw stage. Users
  then see "commercial floating stops at 9'6" on this gauge".
- Pursue a rated release once GRDA or an outfitter gives a gauge-stated low or optimal
  anchor, and GRDA confirms it enforces today's displayed USGS stage.

## Biggest source disagreements

- **Chewey no-float level:** Diamondhead says 9 ft "No Floating" (labelled "Action Stage",
  apparently borrowed from NWPS). GRDA and the IRA say 9'6".
- **Cooler size:** GRDA rule ≤52 qt (also in the 2025 guide). Eagle Bluff's rules page says
  ≤32 qt, and its FAQ says 48 qt.
- **Alcohol at access areas:** OAC 300:40-3-2 allows beer and wine at Stunkard and Echota;
  the 2025 guide's list omits both. Rule 2-3(h) says "seven" dry areas but names six.
- **Combs Bridge mile:** RM 36.1 in the rule, RM 36.5 ("New Combs Bridge") in the guide.
- **WOKA coordinates:** two AGFC sources are ~490 m apart. AGFC's feature table codes WOKA
  to AR county 04, but Nominatim places both points in Adair Co., OK.
- **2020 accident flow:** AW says 6,000 cfs (gauge unstated); USGS daily means were 3,730
  (Tahlequah) and 2,710 (Chewey).
- **Provisional discharge, 2026-11-02:** Watts 318 cfs > Chewey 247 cfs despite more
  drainage at Chewey. This points to rating shifts at Chewey.

## Rejected numbers (not in `thresholds`)

- Eagle Bluff "ideal 3.5–5.5 ft": no gauge stated, single source.
- AGFC "200–1,000 cfs": Arkansas reach, on a non-polled AR gauge (07195400).
- Save the Illinois River "normal" flows (Watts 437/211 cfs; Tahlequah 702/248 cfs): these
  describe conditions, not floatability, and their baselines conflict.
- The 2010 blog's average (2.60 ft / 225 cfs at Tahlequah): an old datum and a statistic,
  not a threshold.
- NWPS flood stages: cross-check only. They are about 10–14k cfs, far above the floater
  ceiling.
- The AW "low runnable" label at 4.9 ft Tahlequah: no published band boundaries.
- USGS percentiles: not used.
- The ArcGIS "Oklahoma Public Recreation Access" layer: a personal account with no
  attribution, so not used for coordinates.

## Decisions for the owner

1. Unrated now (recommended), or a rated release later on GRDA Appendix A plus a new
   low-end source.
2. Display unit for the measurement links: ft, which matches GRDA and the outfitters
   (recommended), or cfs, which is physically steadier given the stage drift.
3. Primary gauge: Chewey 07196090 (proposed; it is the GRDA reference for the outfitter
   zone), or Tahlequah 07196500 (longest record; AW's reference).
4. Lower endpoint: Murrell Home (USACE, high-water danger) or US-62 Bridge.
5. Whether to show GRDA's level-based commercial limits as regulation prose on the river
   page.
6. `riverType` stays `rain_flashy` (proposed) or becomes `spring_fed_float`. The baseflow is
   sustained all summer, but the rises are rain-driven.

## Questions for GRDA (Scenic Rivers Ops, 918-456-3251)

- Do you enforce Appendix A against the gauge height USGS displays today? Have the stage
  limits been reviewed since the Chewey and Tahlequah stage shifts?
- Is there a published low-water guidance level, or a level below which you advise against
  floating?
- What is the main-channel route past the Lake Frances dam remnant below WOKA? Is the
  stair-step mitigation complete, and is it safe at all levels?
- What is the current commercial-use status at Watts, Round Hollow, Stunkard, Peavine, No
  Head Hollow and Echota after the ODWC agreement (extended to Feb 2025)?
- Which site is the "Lake Frances Dam Public Access Site", and which is the seventh dry
  area?
- Do you have GIS coordinates for the public access areas (launch and parking)?
- Is Chewey Bridge a lawful public launch?

## Questions for an outfitter (e.g. Eagle Bluff, Diamondhead, Peyton's Place)

- Which gauge is "ideal 3.5–5.5 ft" read on? At what reading do you stop renting for low
  water, or switch to short trips only?
- What are the exact put-in and take-out pairs and mileages for your short and long trips?
- Do you shuttle or land private boats, and on what terms?

## Sites not reached

- **OSCN:** blocked by a Turnstile challenge.
- **waterdata.usgs.gov HTML:** 403; the data was confirmed via its APIs instead.
- **USGS rating tables (`get_ratings`):** 403 (CloudFront).
- **wdr.water.usgs.gov station reports:** 404.
- **Overpass OSM:** connection reset and timeouts.
- **counselstack, legalfix, midpage:** 429. **justia:** 403.
- **AW GraphQL and gauge pages:** 404.
- **hangingrockfloats.com:** 503.
- **www.illinoisriver.net (Falcon Floats):** DNS not allowed in this session; it must be
  allowed in the session's network settings to read it.
- **allamericanfloats.com:** a domain-for-sale placeholder (business status unknown).
