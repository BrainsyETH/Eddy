# Norfork tailwater pilot activation — October 29, 2026

Evan directed activation of the Norfork pilot on 2026-10-29 ("activate
river"), after reviewing the remaining gaps listed below. This record states
what was checked, what was not, and what activation publishes. It is the
evidence behind the `readiness` and `tailwaterPilot` reviews in
[`dossiers/norfork-tailwater.json`](../dossiers/norfork-tailwater.json).

Status by the repository's three states: **implemented** (gate and staging
migrations applied; river activated in production), **device-verified:
unconfirmed** (no web/iOS/MCP acceptance walkthrough recorded), and
**released** on the web: at about 12:00 UTC the Norfork Dam page linked "View
Norfork Tailwater below the dam", `/rivers/arkansas/norfork-tailwater`
rendered its tailwater status ("not generating"), and the hazards API returned
both new rows. The iOS app reads the same API; not checked on a device.

## What changed

| Change | Where |
| --- | --- |
| Activation gate refuses a tailwater without a verified per-river pilot review, without the unrated policy, or when the review does not name exactly the approved float endpoints | `supabase/migrations/20261029114729_tailwater_pilot_gate.sql` |
| `norfork-tailwater` set to `condition_rating_mode = 'unrated'`; Norfork Dam and Highway 5 bridge mapped as hazards | `supabase/migrations/20261029115032_stage_norfork_tailwater_pilot.sql` |
| River activated through `review_river_activation` with the dossier's reviews | `scripts/ingestion/activate-rivers.ts norfork-tailwater --apply` |

White and Taneycomo stay inactive. The scope check means a two-ramp corridor
review cannot activate either: their 23 and 5 approved endpoints need their
own review, or fewer approved endpoints.

## Checks run on 2026-10-29

| Criterion | Evidence |
| --- | --- |
| Corridor | Dam-Quarry Boat Ramp (mile 0.44) → Norfork Access, the Norfork #1 east-bank ramp on the White (mile 5.01). These are the river's only two approved float endpoints; Dry Run Creek, Bill Ackerman and the Dam-Quarry campground are excluded from endpoints (October 15/17 reviews). |
| Legal access | Dam-Quarry: AGFC facility 1586 and Recreation.gov facility 232565 (USACE). Norfork #1: AGFC facility 98, agency-owned. Identity and pins confirmed with Evan on 2026-10-17 (issue #1541). Current posted restrictions, fees and hours are **not** confirmed. |
| Gauge | Primary link is USACE `swl-norfork-dam` release, cfs, active. `https://eddy.guide/api/dams/swl-norfork-dam` read at 11:43 UTC returned release 205 cfs, turbine 20 cfs and tailwater stage, observed at 07:00 UTC and labelled `lagging` — Corps publication lag, which the app shows with its age rather than as current. |
| Conditions | Unrated: no recreational thresholds on any Norfork gauge link (checked inside the staging migration). Registered tests cover missing/stale observations, no wading all-clear and withheld float times (`shared/tailwater-status.test.ts`, `float-time-tailwater.test.ts`). The four-scenario device matrix in the October 15 review has **not** been recorded. |
| Hazards | Norfork Dam at mile 0.00 (danger; upstream of every access) and Highway 5 bridge at mile 4.60 (info; channel point nearest Wikipedia's 36.21361, -92.28639, 64 m away). USACE restricted-area boundaries and warning-system status were **not** obtained; no agency hazard wording was found for the bridge piers. |
| Routing | `get_float_segment(Dam-Quarry, Norfork Access)` returned 4.57 mi, a valid 15-vertex LineString, matching the October 15 preview. |

Activation preview before apply returned only the expected warnings:
`mileage_equals_length` (Norfork Access is the terminal access, deliberately
at the stored 5.01 mi extent).

## Accepted gaps

Activated with these open, at Evan's direction. They remain tracked in
issue #1541:

- No endpoint photos are published for either ramp; the desk search found no
  reusable photo of either ([photo research](TAILWATER_PHOTO_RESEARCH_2026-10-29.md)).
- Posted USACE dam restrictions and warning-system status.
- Web/iOS/MCP acceptance walkthrough for the four tailwater scenarios.
- Field observations at both ramps (water's edge, signage, fees, hours).

No safe wading level, release threshold, travel time or departure window was
introduced.
