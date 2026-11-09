# Stockton Lake — ramp elevation dossier

24 ramps filed under this lake by the Kansas City District layer, retrieved 2026-11-09. Reference pools: multipurpose 867 ft, flood 892 ft (NGVD29; USACE Kansas City District, Stockton Lake project data (multipurpose pool 867.0, flood control pool 892.0)).

The layer documents `elev_low` as the bottom of the ramp and `elev_high` as the elevation at which the ramp is closed. 15 ramps carry both values with nothing to question; 9 carry a flag below. A flag is a question for review, not a verdict.

| Ramp | Designation | Agency | Bottom (ft) | Closure (ft) | Feature edited | Flags |
| --- | --- | --- | ---: | ---: | --- | --- |
| 3 Hills Access | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Aldrich Access | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Cedar Oaks Access | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Cedar Ridge | Boat Ramp | USACE | 828.3 | 871 | 2024-12-09 |  |
| Cedar Ridge (east ramp) | Boat Ramp | USACE | 859 | 871 | 2024-12-09 |  |
| Crabtree | Boat Ramp | USACE | 828.3 | 871 | 2024-12-09 |  |
| Greenfield | Boat Ramp | USACE | 860.6 | 871 | 2024-12-09 |  |
| Hawker Point | Boat Ramp | USACE | 843.5 | 871 | 2024-12-09 |  |
| High Point | Boat Ramp | USACE | 860 | 871 | 2024-12-09 |  |
| Lowe Access | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| Masters | Boat Ramp | USACE | 842.5 | 869.98 | 2024-12-09 |  |
| Mutton Creek | Boat Ramp | USACE | 834.5 | 871 | 2024-12-09 |  |
| Mutton Creek Marina | Boat Ramp | Lease | 843.4 | 871 | 2024-12-09 |  |
| Orleans Trail | Boat Ramp | USACE | 837.5 | 871 | 2024-12-09 |  |
| Orleans Trail Marina | Boat Ramp | Lease | 837.5 | 871 | 2024-12-09 |  |
| Ruark Bluff West | Boat Ramp | USACE | 843.5 | 871 | 2024-12-09 |  |
| Sac Valley Access | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Son's Creek Access | Access | MDC | — | — | 2024-12-09 | no_thresholds |
| State Park Marina | Boat Ramp | MODNR | 843.6 | 871 | 2024-12-09 |  |
| Stockton | Boat Ramp | USACE | 843.5 | 871 | 2024-12-09 |  |
| Stockton State Park | Boat Ramp | MODNR | 843.6 | 871 | 2024-12-09 |  |
| Taylor Heights Access | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Umberland Access | Access | USACE | — | — | 2024-12-09 | no_thresholds |
| Umberview Access | Access | USACE | — | — | 2024-12-09 | no_thresholds |

## What each flag means

- `no_thresholds`: no elevations published; the page must say so, never compare the pool
- `one_threshold_only`: only one of bottom / closure published
- `closure_not_above_bottom`: closure elevation is not above the ramp bottom; fields may be swapped
- `narrow_band`: under 5 ft between bottom and closure; confirm the semantics at this ramp
- `thresholds_below_this_lake`: both elevations sit well below this lake's multipurpose pool; probably a ramp on another waterbody filed under this lake
- `bottom_above_flood_pool`: ramp bottom above the flood pool; check the number
- `closure_above_flood_pool`: closure elevation above the flood pool; may mean "never closes for high water", confirm

