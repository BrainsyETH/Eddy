# Lake and dam experience — visual review

## Current review correction

The latest captures use the actual Eddy components through the development-only
fixture route in `npm run test:lakes`. **Every reading, schedule and launch in
these captures is synthetic.** The fixture explicitly enables the pilot UI
except in the held-release case. Neither public allowlist is enabled.

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
unreviewed ramp thresholds. The six approvals have since been withdrawn;
these images and [their earlier checks](real-data-browser-checks.txt) are not
evidence of current approval or publication. They were local renders, never
screenshots of released public lake pages.

The older oversized lake-on-dam iteration remains in
[the earlier pilot captures](../lakes-pilot-2026-11-09/README.md); its provenance
differs too.

## Production data and publication

The schema and 200 real pool readings remain in production. There are 46
pending launch candidates and **zero approved launches**; six have prepared
research for a human to review in `/admin/lakes`. The correction and source
records are in
[`reviewed-pilot`](../../../scripts/ingestion/lakes/2026-11-09/reviewed-pilot/README.md).

`src/lib/lakes/public-pages.ts` independently gates the dam redesign and public
lake pages. Both allowlists are empty. The hourly collector intentionally
starts with foundation deployment while the UI stays held. Public lake rollout
still requires human launch approval, a monitored production sync and release
checks. Once a route is published, a data outage shows an unavailable state
instead of removing it. Current CI results are recorded in PR #1765.
