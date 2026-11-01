# Missing river-access finder, v2 (2026-11-01)

Output of `scripts/ingestion/propose-public-land-access.ts` (read-only; it
writes nothing to the database). It replaces the v1 list in
[`../agency-gis/2026-11-oneoff/README.md`](../agency-gis/2026-11-oneoff/README.md#missing-public-land-access-finder).

| File | What it is |
| --- | --- |
| `candidates.csv` / `candidates.geojson` | Places to check, sorted by tier then score, one per 300 m of river |
| `suspect-records.csv` | Access points pinned more than 300 m from the real channel; not trusted as "known" |

These are places for a person to look at, not access points. A road reaching
public ground says nothing about a launch being legal, safe or usable.

## Why v2

v1 read only Forest Service (MVUM) roads. Its top Eleven Point pick, Boom Hole,
was wrong: a 1.5-mile high-clearance track to a river feature. The spot
floaters actually use, **Long Hollow**, sits about 0.8 km away. It is reached
on Oregon County Road 416, which ends 48 m from the channel. v1 missed it for
three reasons:

1. **No county roads.** v2 adds Census TIGER local and secondary roads.
   MTFCC S1500 marks a 4WD trail.
2. **Eddy's river line is coarse**, with about one vertex per 400 m. v2
   measures distance to water against the USGS NHD high-resolution channel
   and uses Eddy's line only for position along the river.
3. **Road geometry.** County Road 416 loops down to the river and back, so its
   nearest point is mid-road, not an end. v2 adds "road loops to river"
   approach points. Its dead-end test also ignores a road's own vertices:
   TIGER has seven vertices in Long Hollow's last 49 m.

Ranking also changed. A county road ending on public bank now outranks a
high-clearance Forest Service track, and closer ends outrank farther ones.
Candidates are named by the nearest tributary mouth, with a search phrase. A
quick search confirmed Long Hollow in minutes.

The pure helpers and their tests are in `public-land-access-2026-11.ts`. The
tests include Long Hollow vs Boom Hole and the seven-vertex stub.

## Tiers

- **A**: a drivable road ends at, or loops down to, public riverbank.
- **B**: one of two things:
  - the road reaches the water, but the land is not shown as public (often a
    county right-of-way, so check legality);
  - or it is a high-clearance Forest Service track.
- **C**: a road crosses the river (a bridge or ford).

## Validation

- **Holdout:** `--river=eleven-point --holdout=long-hollow` treats Long Hollow
  as unknown. v2 found it as the **#1 tier-A candidate**: Co Rd 416, 47 m to
  water, 15 m from the access pin. Boom Hole fell to tier B (score 87).
- **Recall:** trusted launches with a road candidate within 0.5 km:
  - Eleven Point: 12 of 12;
  - Big Piney: 14 of 17. The misses weren't investigated; v1 noted that
    water-only float camps can't be found from roads.
- **v1 picks under v2:**
  - High Log Eddy stays tier A;
  - Henry River moves to B (bank not shown public);
  - FS 1794 is a C crossing;
  - Boom Hole is no longer listed, because Long Hollow is now a known access
    within 1 km.

## 2026-11-01 run

141 candidates:

| River | Tier A | Tier B | Tier C |
| --- | ---: | ---: | ---: |
| Eleven Point | 5 | 45 | 1 |
| Big Piney | 4 | 80 | 6 |

Tier A:

| River | Place | Road | To water | Between | Pin |
| --- | --- | --- | ---: | --- | --- |
| Eleven Point | Hurricane Creek mouth | Forest Rd 4031 (end) | 51 m | Greer Crossing → Turner's Mill | 36.776422, -91.275183 |
| Eleven Point | (unnamed) | unnamed road (loop) | 65 m | Boze Mill → Riverton | 36.651746, -91.186327 |
| Eleven Point | (unnamed) | Forest Rd 3230A (loop) | 71 m | Turner Mill South → McDowell | 36.750056, -91.249741 |
| Eleven Point | (unnamed) | unnamed road (end) | 92 m | Greer Crossing → Turner's Mill | 36.785240, -91.311326 |
| Eleven Point | Rush Creek mouth | unnamed road (end) | 94 m | Riverton → Morgan Spring | 36.565231, -91.176195 |
| Big Piney | (unnamed) | unnamed road (loop) | 47 m | East Gate → Crossroads | 37.766383, -92.053059 |
| Big Piney | (unnamed) | FS 255 High Log Eddy (end, MVUM) | 65 m | Warren Bridge → Slabtown | 37.544632, -92.021159 |
| Big Piney | (unnamed) | unnamed road (end) | 101 m | Warren Bridge → Slabtown | 37.548110, -92.033993 |
| Big Piney | (unnamed) | unnamed road (loop) | 133 m | Wilderness Ridge → East Gate | 37.740849, -92.040548 |

## Suspect records (not changed)

| River | Record | Approved | Pin to channel |
| --- | --- | --- | ---: |
| Eleven Point | Hwy 160 Bridge (`hwy-160-bridge`) | no | over 500 m |
| Big Piney | Boiling Spring Access (`boiling-spring`) | **yes** | 429 m |

## Promoted from this finder

**Long Hollow** (Eleven Point) went in from
`../access-points/eleven-point.json` via `import-dossier-access-points.ts`.
`../access-points/reviews/long-hollow-2026-11-01.csv` was then applied with the
guarded repair script:
- road surface set to dirt + 4WD required (the dossier RPC has no
  road-surface key);
- river mile set to 13.1. The geometry mile was 17.22, which put it below
  Greer Crossing; 13.1 is interpolated on the curated scale between Cane Bluff
  (9.3) and Greer (16.6).

Approved, USFS-managed, float endpoint.

To promote another confirmed spot, add it to a dossier and import it. It lands
`approved = false`.
