# Buffalo National River — access-point coordinates

`buffalo-access-points.csv` is the canonical coordinate source for the 22
Buffalo National River access points. Import with:

```bash
npx tsx scripts/import-access-points-csv.ts scripts/data/buffalo-access-points.csv
npx tsx scripts/snap-access-points.ts
```

## Provenance

Coordinates come from the National Park Service's own **`BUFF_River_Accesses`**
feature layer — the layer that backs the official Buffalo National River Float
Guide dashboard and Park Atlas web map:

- Feature service: `https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0`
- Reached via the NPS "Buffalo National River Float Guide" ArcGIS dashboard
  (item `3606e2401fdd428cbbdff9518cbe11af`) → its web map
  (`e0e5681694c54b6cb80dc594b59ff565`) → operational layer `BUFF_River_Accesses`.
- Retrieved 2026-07 as GeoJSON (`outSR=4326`); 22 features, all used.
- Cross-checked against the NPS `developer.nps.gov` `/campgrounds` endpoint,
  which independently returned matching coordinates for the 11 developed
  accesses (agreement within ~200 m).

Ordering and river mileage (used to sanity-check snapping) come from the NPS
float-distance matrix, encoded in `scripts/data/buffalo-float-points.ts`.

## Notes

- **Naming.** The feature layer labels a few points differently from common
  signage / this project's float matrix. We keep the existing project spelling
  where a record already exists — notably **Kyle's Landing** (apostrophe) so the
  importer dedupes against the row already in the database, and **Grinders
  Ferry** / **North & South Maumee** to match `buffalo-float-points.ts`.
- **Type.** All rows use `type=access`, the established convention in
  `access_points` (the template's `public_ramp` value is unused in the DB).
- **Dixon Forge** (the upstream "Hailstone" Class III put-in ~15 mi above
  Boxley) is intentionally **not** included: it is not an official NPS river
  access and has no authoritative coordinate in the feature layer. It remains
  documented in `buffalo-float-points.ts` for float-distance context only.
- **No hand-entered coordinates.** Every lat/lon here is from the NPS feature
  layer. Do not edit coordinates by hand — re-pull from the source instead.
