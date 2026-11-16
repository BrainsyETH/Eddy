# Truman Lake — ramp elevation dossier

45 ramps filed under this lake by the Kansas City District layer, retrieved 2026-11-09. Reference pools: multipurpose 706 ft, flood 739.6 ft (NGVD29; USACE Kansas City District, Harry S. Truman Dam and Reservoir project data (multipurpose pool 706.0, flood control pool 739.6)).

The layer documents `elev_low` as the bottom of the ramp and `elev_high` as the elevation at which the ramp is closed. 19 ramps carry both values with nothing to question; 26 carry a flag below. A flag is a question for review, not a verdict.

| Ramp | Designation | Agency | Bottom (ft) | Closure (ft) | Feature edited | Flags |
| --- | --- | --- | ---: | ---: | --- | --- |
| Avery | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Berry Bend | Boat Ramp | USACE | — | — | 2024-12-09 | no_thresholds |
| Brush Creek | Boat Ramp | USACE | — | — | 2024-12-09 | no_thresholds |
| Bucksaw Marina | Boat Ramp | Lease | 704 | 724 | 2024-12-09 |  |
| City of Osceola | Boat Ramp | — | — | — | 2025-01-15 | no_thresholds |
| City of Roscoe | Boat Ramp | Lease | 704 | 724 | 2024-12-09 |  |
| County Line | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Cross Timbers Access | Boat Ramp | — | — | — | 2025-01-15 | no_thresholds |
| Crowes Crossing | Boat Ramp | USACE | 706 | 724 | 2024-12-09 |  |
| Deepwater | Access | Lease | 704 | 723 | 2024-12-09 |  |
| Deepwater Creek | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Drake Harbor | Boat Ramp | Lease | — | — | 2025-01-15 | no_thresholds |
| East Bledsoe Ferry | Boat Ramp | USACE | 645 | 677 | 2024-12-09 | thresholds_below_this_lake |
| Fairfield | Access | USACE | 704 | 720 | 2024-12-09 |  |
| Finey | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Fox Run | Boat Ramp | USACE | — | — | 2024-12-09 | no_thresholds |
| Grand River | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Higgins Landing | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Knisely | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Lays Valley View | Boat Ramp | — | — | — | 2025-01-15 | no_thresholds |
| Long Shoal | Boat Ramp | USACE | 704 | 724 | 2024-12-09 |  |
| Long Shoal Marina | Boat Ramp | Lease | 704 | 718 | 2024-12-09 |  |
| Macks Camp | Access | — | — | — | 2024-12-09 | no_thresholds |
| Mockingbird Hill | Access | — | — | — | 2024-12-09 | no_thresholds |
| Old Timers | Access | — | — | — | 2024-12-09 | no_thresholds |
| Osage Bluff | Boat Ramp | USACE | 704 | 724 | 2024-12-09 |  |
| Osage Bluff Marina | Boat Ramp | Lease | 704 | 723 | 2024-12-09 |  |
| Pom-O-Sa | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Sac River | Access | MDC | 704 | 724 | 2024-12-09 |  |
| Sapps Landing | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Shawnee Bend | Boat Ramp | — | 704 | 724 | 2024-12-09 |  |
| Shawnee Bend | Boat Ramp | USACE | 704 | 724 | 2024-12-09 |  |
| South French Bridge | Boat Ramp | — | — | — | 2024-12-09 | no_thresholds |
| Sparrowfoot | Boat Ramp | USACE | 704 | 725 | 2024-12-09 |  |
| Sterett Creek Marina | Boat Ramp | USACE | 704 | 720 | 2024-12-09 |  |
| Talley Bend | Boat Ramp | USACE | 704 | 724 | 2024-12-09 |  |
| Talley Bend (high water ramp) | Boat Ramp | USACE | 724 | 727 | 2024-12-09 | narrow_band |
| Thibaut Point | Boat Ramp | USACE | 704 | 724 | 2024-12-09 |  |
| Tightwad | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Truman State Park | Boat Ramp | MODNR | 704 | 725 | 2024-12-09 |  |
| Truman State Park Marina | Boat Ramp | MODNR | 705 | 732 | 2024-12-09 |  |
| TT Highway | Boat Ramp | MODNR | — | — | 2024-12-09 | no_thresholds |
| Walnut Grove | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Warsaw City Harbor | Boat Ramp | Lease | 645 | 677 | 2025-01-15 | thresholds_below_this_lake |
| Windsor Crossing | Boat Ramp | USACE | 704 | 720 | 2024-12-09 |  |

## What each flag means

- `no_thresholds`: no elevations published; the page must say so, never compare the pool
- `one_threshold_only`: only one of bottom / closure published
- `closure_not_above_bottom`: closure elevation is not above the ramp bottom; fields may be swapped
- `narrow_band`: under 5 ft between bottom and closure; confirm the semantics at this ramp
- `thresholds_below_this_lake`: both elevations sit well below this lake's multipurpose pool; probably a ramp on another waterbody filed under this lake
- `bottom_above_flood_pool`: ramp bottom above the flood pool; check the number
- `closure_above_flood_pool`: closure elevation above the flood pool; may mean "never closes for high water", confirm

