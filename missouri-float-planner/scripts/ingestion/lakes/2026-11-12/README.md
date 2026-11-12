# Owner review of the remaining launches — November 12, 2026

Target: Eddy production `ilefwfpvphadsbptiaur`. Applied by Claude Code with
`owner-review.sql` at `2026-11-12T15:18:42.726046Z`, after a dry run of the
same block passed every assertion and was rolled back.

## Basis

From the 40 pending candidates left after the
[pilot approval](../2026-11-09/reviewed-pilot/README.md), the owner spot-checked
a sample on imagery (Crowes Crossing, Windsor Crossing, Truman State Park
Marina, Walnut Grove, Lays Valley View, Romp Hole), reviewed the coordinates of
every flagged candidate, and instructed: "Everything else looks good. Lets
proceed." This is owner approval after a sample check, not a field inspection
or a claim that any ramp is currently open. Fees and amenities stay unknown.

## What changed

| Change | Rows |
| --- | --- |
| Owner-supplied ramp coordinates (old pin kept in the added source entry) | Cricket Creek `36.482388, -93.300557`; Holiday Island `36.490067, -93.760638`; Berry Bend `38.20004, -93.50789` |
| Owner-confirmed duplicates merged: sources combined on the kept row, other row deleted | `shawnee-bend` kept (Corps agency taken from `shawnee-bend-2`); `osage-bluff` kept (`osage-bluff-marina` merged) |
| Approved with launch method `trailer` | 35 (6 Table Rock, 29 Truman), including the three earlier holds |
| Left pending | `beaver-lake-dam-site-boat-ramp`, `bertrand-boat-ramp`, `houseman-boat-ramp` |

Audit: 35 `lake_launch_approve` and 2 `lake_launch_delete` records in
`admin_activity_log`, batch `owner-review-20261112`; each delete keeps the full
removed row. Read-back: 44 launches, 41 approved (Table Rock 6, Truman 35), 3
pending.

Notes carried in `review_note`:

- **Truman State Park** is the campground ramp, which Missouri State Parks
  limits to campers March–November; the owner confirmed it and named
  `truman-state-park-marina` as the more popular public ramp. The launch
  schema has no public restriction field, so the page does not show this.
- **Romp Hole** stays linked to access point `romp-hole-access`; the owner
  confirmed AGFC ownership, which the row already carried.
- The six Truman ramps with no agency (City of Osceola, Lays Valley View,
  Macks Camp, Mockingbird Hill, Old Timers, South French Bridge) were confirmed
  by the owner as real but smaller, out-of-the-way ramps.

## Still open

The three Beaver-tailwater ramps are White River access below Beaver Dam, not
Table Rock lake launches. The owner wants them as White River access points
for float planning. Eddy's `white` river is the Bull Shoals tailwater
(Bull Shoals Dam downstream), about 100 km away, so these need a Beaver
tailwater reach (geometry, gauge, river miles) before they can be added as
access points. They stay pending and unpublished until then.
