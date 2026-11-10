# Lake and dam experience — visual review

## Foundation review correction

The latest captures use the actual Eddy components through the development-only
fixture route in `npm run test:lakes`. **Every reading, schedule and launch in
these captures is synthetic.** At capture time, the fixture explicitly enabled
the pilot UI except in the held-release case; both public allowlists were empty.
The activation change now tests the approved public allowlists directly and
retains an explicitly disabled fixture for the rollback case.

| Capture | What it verifies |
| --- | --- |
| [Held dam — phone](correction-held-dam-390.png) | A registry lake with populated history and launches still keeps the established dam experience while the dam release gate is closed. |
| [Enabled dam preview — phone](correction-table-rock-dam-390.png) | Observed generation leads the complete schedule in both DOM and visual order. The compact photo header has no credit link. |
| [Truman lake preview — phone](correction-truman-lake-390.png) | The old payload deliberately includes unreviewed ramp elevations; neither the numbers nor the elevation-caution footer is displayed. |

[Correction browser checks](correction-browser-checks.txt) cover 1440, 768,
390 and 320 px: the independent release gate, observation-first order,
threshold hiding and verified-threshold display, value alignment, timestamps,
daily cadence, filters, directions URLs, map keyboard selection, chart controls
after clock updates, stale-caution expiry, missing readings, unavailable
schedules, gate-operated dams and the unpublished route's noindex.

The fixture retains real navigation, typography, Eddy icons, cards and charts.
It omits the production breadcrumb, Share control and footer. External map
tiles use a neutral test style; the checks verify interactions, not geographic
accuracy. Photography uses the existing attributed iOS assets; provenance is
in `public/lakes/credits.json` and public attribution is on `/photo-credits`.

## Superseded captures

The unprefixed `table-rock-*`, `truman-*` and `baseline-*` fixture images record
the earlier design. Some show schedule-first phone order or an inline credit
control. They are historical evidence, not the current corrected layout.

The [Table Rock desktop](table-rock-real-1440.png) and
[Truman phone](truman-real-390.png) `*-real-*` images are also **superseded**.
They used captured production snapshots, 200 backfilled pool observations
and six launches that an agent had approved. The Truman image exposes
unreviewed ramp thresholds. Those agent approvals were withdrawn; the owner
later explicitly approved the six prepared records. These images and
[their earlier checks](real-data-browser-checks.txt) are not evidence of that
later owner decision or of public release. They were local renders, never
screenshots of released public lake pages.

The older oversized lake-on-dam iteration remains in
[the earlier pilot captures](../lakes-pilot-2026-11-09/README.md); its provenance
differs too.

## Production data and publication

The schema and 200 real pool readings remain in production. There are 46
launch records: **six owner-approved trailer ramps and 40 pending candidates**.
The owner accepted the six prepared proposals in conversation; this does not
claim an independent human inspection. The correction and source
records are in
[`reviewed-pilot`](../../../scripts/ingestion/lakes/2026-11-09/reviewed-pilot/README.md).

`src/lib/lakes/public-pages.ts` independently gates the dam redesign and public
lake pages. The owner authorized activation after merging PR #1765; the
activation change enables only Table Rock and Truman. Its merge still requires
a monitored production sync and release checks, recorded in the activation PR.
The hourly collector is scheduled independently of the UI gates. Owner approval
for the six prepared launches is recorded. Once a route is published, a data
outage shows an unavailable state instead of removing it. The foundation CI
results are recorded in PR #1765.
