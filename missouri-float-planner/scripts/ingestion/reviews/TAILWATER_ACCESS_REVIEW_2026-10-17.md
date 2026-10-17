# Tailwater access review — October 17, 2026

Implements the access-identification decisions reviewed with Evan in
[issue #1541](https://github.com/BrainsyETH/Eddy/issues/1541).
Empire Park and Armstrong Hole are resolved. The three rivers remain inactive;
the broader issue also tracks release acceptance and later enrichment.

## Changes

| Access | Implementation |
| --- | --- |
| Hatchery Bank Access | Use Evan's coordinate `36.595827, -93.304095`; retain bank fishing and `is_float_endpoint=false`. The hatchery boat ramp remains separate. |
| Empire Park | Place the pin on the reviewed concrete ramp at `36.65712, -93.13281`, east of the fishing dock and upstream of Powersite Dam on Taneycomo. Remove the unsupported parking-capacity estimate and fix the city link. |
| Roundhouse Shoals | Move to the city's access-area marker `36.2679403, -92.5284983`; retain walk-in fishing, gravel parking and no boat ramp. Remove the AGFC ownership attribution that belonged to the old Cotter feature match. |
| Armstrong Hole | Add the separate walk-in fishing site at the city's marker `36.2633804, -92.53777`. Evan explicitly confirmed no boat access; `is_float_endpoint=false`. |
| Guion, Stone County | Add the county to the display name while preserving the existing UUID, `guion-access` slug and southwest-bank pin. |
| Guion, Izard County | Add one opposite-bank facility with two concrete ramps. The endpoint pin identifies AGFC ramp #1 (1372); ramp #2 (2357), parking and jetty retain distinct evidence references. |
| Sylamore Ferry | Retain the reviewed ramp #2 pin and describe only its Highway 5 bank, upstream of the Highway 9 bridge. |
| Dam-Quarry Campground | Record the shared recreation area and explicitly exclude the campground record from float endpoints; the existing boat ramp serves that purpose. |

Buffalo City's current pin identifies ramp #2 within its two-ramp facility; no
move or duplicate is needed. Norfork #1, Rim Shoals, Chesmond Ferry, Dry Run
Creek, Bill Ackerman, North Beach and Rockaway retain the reviewed pins and
classifications.

## Evidence and precision

[The evidence file](tailwater-access-evidence-2026-10-17.json) records source
identities, coordinates and methods. These are map/owner confirmations, not a
field survey or a claim about current operating conditions. Evan's supplied
images have not been licensed as public endpoint photos.

Empire's coordinate was transcribed from the concrete ramp Evan selected, using
a georeferenced Esri imagery export of the same parking lot, dock and ramp.
The export bounds and selected pixel are retained in the evidence file. This
is an approximate imagery-derived point, not a new GPS observation. The MDC
Ozark Beach map is dated November 14, 2018 and supports facility geography,
not current regulations. Roundhouse and Armstrong coordinates are city map
access-area markers, not boat landings.

## Applying the correction

[tailwater-access-corrections-2026-10-17.sql](tailwater-access-corrections-2026-10-17.sql)
contains six existing-row corrections and two new records. It:

- Checks the three inactive river identities and expected access values before
  writing; aborts on conflicting changes.
- Preserves existing UUIDs, slugs, approval and endpoint decisions.
- Uses the existing atomic dossier RPC, recalculates mileage only for moved/new
  points, and validates post-trigger snaps before approving the two specifically
  reviewed new records.
- Changes no river geometry, activation state, thresholds, fees or photo fields.
- Ends in `ROLLBACK` for preview. Replace only that final statement with `COMMIT`
  for an authorized production application, then read back the affected rows and
  run `make check-db`. This patch is DML, not a schema migration.

**Database preview passed; production application is pending.** The exact
transaction ran against the target project and rolled back. A second preview
executed the patch twice within one transaction: the two added IDs and review
states were preserved, all river rows were unchanged, and unrelated access
rows were unchanged. That transaction also rolled back.

| Changed/new pin | Geometry mile | Channel snap |
| --- | --- | --- |
| Hatchery Bank Access | 0.39 | 35.19 m |
| Empire Park ramp | 22.52 | 195.71 m |
| Armstrong Hole | 17.67 | 74.54 m |
| Roundhouse Shoals | 18.34 | 81.30 m |
| Guion, Izard County | 90.46 | 94.00 m |

Guion's two county accesses project to the same terminal river mile; they are
separate banks, not a useful float pair. A channel snap does not by itself
establish a navigable shoreline connection.

The importer now accepts an explicit existing `slug` when a display name is
changed. This keeps future Guion imports attached to the original record and
public URL. New rows still default to unapproved under ordinary dossier imports;
only this reviewed patch approves the two named additions.

Dam restrictions were deferred by Evan during this access review. Fixed-hazard
review, publication scope and web/iOS/MCP release acceptance remain separate
work; this change does not reopen the resolved site-identification questions.
