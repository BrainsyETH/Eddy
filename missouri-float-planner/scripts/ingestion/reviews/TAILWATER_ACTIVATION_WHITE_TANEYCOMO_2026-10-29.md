# White and Taneycomo activation — October 29, 2026

Evan decided to publish every approved access point on both rivers ("the goal
is to show access points at the highest level") and directed activation the
same day, after Norfork
([record](NORFORK_PILOT_ACTIVATION_2026-10-29.md)). This record is the evidence
behind the `readiness` and `tailwaterPilot` reviews in
[`dossiers/white.json`](../dossiers/white.json) and
[`dossiers/taneycomo.json`](../dossiers/taneycomo.json).

Status: **implemented** (staged by `20261029154803`, activated through
`activate-rivers.ts`); **device-verified: unconfirmed**.

## Scope

| River | Published float endpoints | Miles |
| --- | --- | --- |
| White (Bull Shoals Dam → Guion) | All 23 approved: Jim Griffin to both Guion ramps | 0.54–90.46 |
| Lake Taneycomo (Table Rock Dam → Powersite Dam) | All 5 approved: Hatchery Boat Ramp, Cooper Creek, Branson City, Rockaway Beach, Empire Park | 1.04–22.52 |

This supersedes the October 15 proposal to open each river with a short
corridor. The activation gate's scope check holds `tailwaterPilot.floatEndpoints`
to exactly these sets; a later endpoint approval changes what activation
publishes and needs the dossier updated to match.

## Checks run on 2026-10-29

| Criterion | White | Taneycomo |
| --- | --- | --- |
| Gauge | Bull Shoals release 713 cfs, generating, observed 15:00 UTC (fresh at 15:47) | Table Rock release 20 cfs, idle, observed 15:00 UTC (fresh) |
| Conditions | Unrated; no thresholds on any of 4 linked gauges | Unrated; 1 linked gauge, no thresholds |
| Hazards | Bull Shoals Dam, mile 0.00 | Table Rock Dam, 0.00; Powersite Dam, 23.11 (Empire Park ramp is 0.59 mi above it) |
| Routing | 22 consecutive segments valid, each equal to its manual mileage | 4 consecutive segments valid, each equal to its manual mileage |

The two Guion ramps are opposite-bank launches at the same mile (90.46).
`get_float_segment` cannot build a zero-length line, which previously surfaced
as a 500 from the planner. `classifyEndpoints` now refuses that pair with a 400
(`same-river-mile`) and a message to pick a take-out downstream.

## Accepted gaps

Activated with these open, at Evan's direction (issue #1541):

- Photos: White Hole and Cotter only on the White; none on Taneycomo
  ([photo research](TAILWATER_PHOTO_RESEARCH_2026-10-29.md)).
- Fixed hazards beyond the dams — shoals, bridges, the Norfork confluence —
  have not been reviewed on either river. Only the dams are mapped.
- Posted USACE limits below Bull Shoals and Table Rock, Table Rock's
  warning-system status, and Powersite's operator and approach limits.
- Ownership questions at Cooper Creek and the Taneycomo hatchery ramp.
- Web/iOS/MCP acceptance walkthrough of the four tailwater scenarios.
- Field observations at the ramps: signage, fees, hours.

No safe wading level, release threshold, travel time or departure window was
introduced.
