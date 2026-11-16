# Pomme de Terre Lake — ramp elevation dossier

14 ramps filed under this lake by the Kansas City District layer, retrieved 2026-11-09. Reference pools: multipurpose 839 ft, flood 874 ft (NGVD29; USACE Kansas City District, Pomme de Terre Lake project data (multipurpose pool 839.0, flood control pool 874.0)).

The layer documents `elev_low` as the bottom of the ramp and `elev_high` as the elevation at which the ramp is closed. 12 ramps carry both values with nothing to question; 2 carry a flag below. A flag is a question for review, not a verdict.

| Ramp | Designation | Agency | Bottom (ft) | Closure (ft) | Feature edited | Flags |
| --- | --- | --- | ---: | ---: | --- | --- |
| Bolivar Landing | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |
| Hermitage | Boat Ramp | MDC | 834 | 860 | 2024-12-09 |  |
| Hermitage Area north | Boat Ramp | MODNR | 834 | 860 | 2024-12-09 |  |
| Hermitage Area south | Boat Ramp | MODNR | 834 | 860 | 2024-12-09 |  |
| HWY 83 Marina | Boat Ramp | Lease | 834 | 860 | 2024-12-09 |  |
| Lightfoot Park | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |
| Nemo Landing Park | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |
| Nemo Marina | Boat Ramp | Lease | 834 | 960 | 2024-12-09 | closure_above_flood_pool |
| Ouarry Point | Boat Ramp | Lease | 834 | 860 | 2024-12-09 |  |
| Outlet Park | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |
| Pittsburg Area State Park | Boat Ramp | MODNR | 834 | 960 | 2024-12-09 | closure_above_flood_pool |
| Pittsburg Area State Park | Boat Ramp | MODNR | 834 | 860 | 2024-12-09 |  |
| Pittsburg Park | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |
| Wheatland Park | Boat Ramp | USACE | 834 | 860 | 2024-12-09 |  |

## What each flag means

- `no_thresholds`: no elevations published; the page must say so, never compare the pool
- `one_threshold_only`: only one of bottom / closure published
- `closure_not_above_bottom`: closure elevation is not above the ramp bottom; fields may be swapped
- `narrow_band`: under 5 ft between bottom and closure; confirm the semantics at this ramp
- `thresholds_below_this_lake`: both elevations sit well below this lake's multipurpose pool; probably a ramp on another waterbody filed under this lake
- `bottom_above_flood_pool`: ramp bottom above the flood pool; check the number
- `closure_above_flood_pool`: closure elevation above the flood pool; may mean "never closes for high water", confirm

