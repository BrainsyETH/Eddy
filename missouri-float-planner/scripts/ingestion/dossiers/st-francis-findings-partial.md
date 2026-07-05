# St. Francis River (MO) — Partial Research Findings (run 1, incomplete)

> Deep-research run wf_4b190bc5-d1a: 5 angles, 17 sources, 14 claims → 9
> confirmed (2–3/3 vote), 0 refuted, 5 unverified. Synthesis + the last
> verification batch **died on the session token limit** (resets 5pm UTC);
> the numeric-anchor pages (USGS monitoring-location, water.noaa.gov, AW
> river-detail, missouriwhitewater.org) all returned **HTTP 403** to direct
> fetch — same egress wall as Buffalo run 1. So: identity + character +
> access mileage are solid; **every numeric level anchor and every USGS site
> number is still a CANDIDATE pending primary-source verification.**

## HEADLINE: this river is not the spring-fed float fast-path

The St. Francis is the **only whitewater river in Missouri** (USFS). The upper
reach we researched — **Millstream Gardens → Silver Mines / Tiemann Shut-ins**
— is a 2.3-mile **Class II–IV, rain-fed** run (American Whitewater), a
**pool-drop** river that "spikes and drops fast." This is a *different
calibration paradigm* from the 8 existing spring-fed floats:
- Its condition badge is a **runnable whitewater range** (paddler go/no-go),
  not a lazy-float "too low / ideal / too high" curve.
- Its reference gauge (Roselle) has a **documented funding-driven outage
  history** — a real data-continuity risk a live badge must handle.
- The **lower** river (below Sam A. Baker SP, mile ~66+) is slower and floats
  more like a normal stream — a per-section river_type split, like Buffalo's
  lower reach.

Implication for sequencing: the *easy* MO wins are the flatter float rivers
(Gasconade, Bourbeuse, Black, lower Meramec-style). The upper St. Francis is
the *hardest* MO river, not the easiest — worth doing, but as a deliberate
"whitewater archetype" case, not the warm-up. Flagged for the owner.

## Gauges (CANDIDATES — none primary-verified; USGS pages 403'd)

| Role | Name (as searched) | USGS # (candidate) | NWS LID | Notes |
|------|--------------------|--------------------|---------|-------|
| Upper / whitewater ref | St. Francis River near Roselle, MO | **07034000** | ROZM7 | AW run keys to "the Roselle gauge"; USGS **dropped it from the national network** once (funding), later restored — verify it is currently live before relying on it |
| Lower | St. Francis River near Patterson, MO | **07037500** | PAZM7 | co-located USGS/NWS; represents the lower river toward Wappapello |

- **Do NOT ingest these site numbers** until each is transcribed from its own
  `waterdata.usgs.gov/monitoring-location/USGS-<n>/` page (the Buffalo [verify]
  gate). 07034000/07037500 came from search snippets, not a fetched USGS page.
- No lat/lon, params (00060/00065), or drainage areas captured (pages 403'd).

## Whitewater-reach anchors (Millstream Gardens → Silver Mines)

- American Whitewater river-detail **#2921** ("Tiemann Shut-Ins"): the run is
  **2.3 miles, Class II–IV, rain-fed**. Search snippet began "The Roselle
  gaug…" — i.e. AW quotes a runnable range **against the Roselle gauge** — but
  **the numeric min/max and its unit (ft vs cfs) were NOT captured** (page not
  fetched). This is the single most important missing number. Source:
  https://www.americanwhitewater.org/content/River/view/river-detail/2921/main
- MWA rates the race reach **Class II–III**; race is **contingent on variable
  water levels** ("verify before traveling"). No numeric race cutoff surfaced.
  Source: https://missouriwhitewater.org/competition/mwc/ (403; snippet text)
- MWA hosts a live "St. Francis River Level" gauge display — organizer keys
  go/no-go to a gauge, **gauge unnamed in snippets** (reference UNSTATED).

## Lower-reach anchors (Sam A. Baker → Wappapello)

- No numeric level guidance captured. MCFA notes water is **"slower below"**
  Sam A. Baker SP (mile 66.5). Represented by the Patterson gauge (07037500).
  Sources: mostateparks.com/park/sam-a-baker-state-park/floating (not fetched),
  missouricanoe.org/river-maps/stfrancis.html

## NWS flood categories

- **NONE captured** — water.noaa.gov gauge pages (rozm7, pazm7, 07037500) all
  403'd. These are the intended high/dangerous anchors and remain OPEN.
  Targets: https://water.noaa.gov/gauges/rozm7 , https://water.noaa.gov/gauges/pazm7

## Access points (MCFA float-mileage table, missouricanoe.org)

| Mile | Access | Notes |
|------|--------|-------|
| 20.2 | Millstream Gardens Conservation Area | whitewater **put-in** (USFS/MWA); S of Hwy 72, Madison County, ~11 mi W of Fredericktown |
| 23.2 | Silver Mines Rec Area / Hwy D | whitewater **take-out**; USFS, 4 campground loops + 2 day-use (unverified) |
| 66.5 | Sam A. Baker State Park access | water slower below here |
| 69.8 | Hwy 34 bridge | |
| 76.4 | Lake Creek | |
| — | Hwy 67 bridge (mile continues) | lower-river takeouts toward Wappapello |

Coordinates: NONE captured — human places every point in admin (rule [manual]).

## Float times

- Whitewater run **2.3 miles** (AW #2921); no published clock time (it's a
  paddling run, not a timed float). Lower-river float times: none captured.

## Open questions / must-get on re-run (targets, all 403 this run)

1. **AW #2921 runnable range**: min/max + unit + confirm it's the Roselle
   gauge. THE calibration core. (americanwhitewater.org/.../river-detail/2921)
2. USGS **07034000** (Roselle) + **07037500** (Patterson) primary pages:
   confirm site #, name, lat/lon, params, drainage area. Is Roselle live now?
3. NWS AHPS flood categories for ROZM7 and PAZM7 (ft) → high/dangerous anchors.
4. Does the platform poll Roselle today? (gauge_stations check) — and what is
   the fallback if USGS drops it again (USACE MVS St. Louis District feed:
   https://www.mvs-wc.usace.army.mil/trans/gage/SF_tab.html)?
5. Confirm the per-section river_type split (upper rain_flashy whitewater vs
   lower calmer float) and whether a **whitewater archetype** is warranted.
