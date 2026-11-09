# Lake and dam experience — visual review

The original captures are local browser captures of the actual Eddy components, using the
labelled fixture route from `npm run test:lakes`. **All levels, schedules,
trends and launch records in those original captures are synthetic.** No fixture launch
has been approved or published. The photographs are the attributed Truman and
Table Rock assets already used by iOS; provenance is in `public/lakes/credits.json`.

The fixture keeps the real site navigation, typography, icons, cards, charts,
filters and map controls. It omits the production page's breadcrumb, Share
control and footer. External map tiles are replaced with a neutral test style;
map checks verify interactions, not geographic accuracy.

The original captures predate the follow-up removal of the inline Photo credit control.
Both pilot headers now keep only the image; attribution is on `/photo-credits`,
reachable from the shared footer.

## Real-data verification

The later [Table Rock desktop](table-rock-real-1440.png) and
[Truman phone](truman-real-390.png) captures use actual production dam
snapshots, the 200 source observations backfilled on November 9, and the
six approved source/imagery-reviewed launch records. They show the final
photo-credit treatment. These are local renders of captured production data,
not screenshots of public lake pages. Their banner identifies that provenance.
The chart has keyboard focus in the captures because its controls were checked.

[Real-data browser checks](real-data-browser-checks.txt) passed at 1440 and
390 px for both pilots: real history, three launches per lake, empty hand-launch
filter, directions URLs, map controls, chart keyboard interaction, no inline
credit link, no overflow, and no browser errors. The map uses the same neutral
test style; geographic pin review is separately recorded with agency and
imagery sources in
[`reviewed-pilot`](../../../scripts/ingestion/lakes/2026-11-09/reviewed-pilot/README.md).

## What to review

| Capture | Annotation |
| --- | --- |
| [Table Rock dam — desktop](table-rock-dam-1440.png) | Full generation chart remains beside observed flow; three measurements share one row and one observation time. The compact lake preview follows operations. |
| [Table Rock dam — phone](table-rock-dam-390.png) | The pilot puts the schedule ahead of observed flow on portrait phones. Photography stays compact. |
| [Table Rock dam — 320 px](table-rock-dam-320.png) | Narrowest check: measurement values remain aligned and do not overlap; lake chart labels retain readable sizing. |
| [Table Rock lake — desktop](table-rock-lake-1440.png) | Lake level and history lead, followed by reviewed launch coverage, then the dam connection. |
| [Table Rock lake — phone](table-rock-lake-390.png) | The launch list remains usable without the map; filter, directions and map actions retain touch targets. |
| [Truman dam — desktop](truman-dam-1440.png), [phone](truman-dam-390.png) | Daily pool reporting is labelled by its cadence. Missing below-dam metrics do not become dummy tiles. |
| [Truman lake — desktop](truman-lake-1440.png), [phone](truman-lake-390.png) | A 20-hour-old daily report remains valid; no invented amenities, photos or opening status appear on launches. |
| [Established dam layout — desktop](baseline-dam-1440.png), [phone](baseline-dam-390.png) | Same fixture rendered through the non-pilot path, for layout comparison. This is a regression reference, not a screenshot of live production. |

The prior oversized lake-on-dam iteration is preserved separately in
[the earlier pilot captures](../lakes-pilot-2026-11-09/README.md). Their provenance
differs; read that record before comparing data values.

## Publication

No public lake routes are approved yet. The route, reciprocal links, Conditions
links and sitemap all use the same release gate. Production migration
`20261109224918`, the history backfill, canonical identity check and six
reviewed locations are recorded. The first monitored production sync and
release checks remain outstanding. A data outage
after publication will show an unavailable state instead of removing the route.

## Validation

- Type checking passed for application and tests.
- ESLint and design-token checks passed; 18 existing ESLint warnings remain.
- All 5,016 registered web tests and the separate 18 Today tests passed. The
  sandbox blocks the `tsx` CLI IPC socket, so the same test file lists ran with
  Node 20 and `node --import tsx` using `tsconfig.test.json`.
- `next build` passed with Turbopack. Production credentials were not used;
  optional data fallbacks logged the expected missing-credential messages.
- Browser evidence is recorded by `npm run test:lakes` at 1440, 768, 390 and
  320 px. The suite checks hierarchy, value alignment, overflow, timestamps,
  daily cadence, filters, keyboard map selection, chart controls after a clock
  update, stale-caution expiry, missing readings, unchanged non-pilot placement,
  unavailable schedules, gate-operated dams and the unpublished route's noindex.
