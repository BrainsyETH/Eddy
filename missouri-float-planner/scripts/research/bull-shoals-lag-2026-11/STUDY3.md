# Study 3: river height, weather and stepped releases (2026-11-12)

Research only, like [study 2](README.md). Nothing here is approved for display.

**Question.** Do river height and wet weather change the delay to first rise
near Norfork, does allowing for them hold up on years no analysis has touched,
and what happens when a small release bump goes first?

**How it was kept honest.** Study 2's data (2025-2026) had all been looked at,
so the models were chosen and frozen on it, the rules and pass marks were
committed ([protocol_conditions.json](protocol_conditions.json), `30b2e778f`),
and only then were 2022-2024 downloaded and scored, once.

## Result

**The blanket estimate does not hold. A conditional one looks promising, and
its live form is not yet tested.** The firmest result is knowing when an
estimate becomes unreliable.

| Pre-set pass mark, 302 release increases in 2022-2024 | Needed | Got |
| --- | ---: | ---: |
| Within 2 hours of the prediction | 80% or more | **89%** |
| Arriving more than 2 hours early | 5% or less | **10%**, so it fails |

The typical miss was 0.4 hours, so the estimate is usually very good. The
failures are concentrated, and they are almost all in the early direction.

![Accuracy by river height](results_conditions/fig1_accuracy_by_river_height.png)

| Gauge height before the release | Events | Within 2 h | More than 2 h early | Median delay |
| --- | ---: | ---: | ---: | ---: |
| Under 5 ft | 22 | 95% | 5% | 14.1 h |
| 5 to 6 ft | 83 | 94% | 6% | 13.5 h |
| 6 to 7 ft | 98 | 98% | 2% | 13.0 h |
| 7 to 8.5 ft | 70 | 87% | 13% | 13.25 h |
| Over 8.5 ft | 29 | 48% | 45% | 9.4 h |

These bands were fixed before scoring. Below 7 ft the estimate is reliable.
Above 8.5 ft the river answers about four hours sooner and the estimate is
wrong nearly half the time.

## Weather

| Label (fixed before scoring) | Events | Within 2 h | More than 2 h early |
| --- | ---: | ---: | ---: |
| Tributaries steady | 259 | 91% | 8% |
| Tributaries moving | 43 | 79% | 19% |
| Under 0.5 inch of rain over four days | 205 | 91% | 8% |
| 0.5 inch or more | 97 | 86% | 13% |

Rain matters less than river height. It hurts mainly when it has reached the
river, which is what moving tributaries show. By year: 2022, a high-water
year, scored 74%; 2023 scored 92% and 2024 95%.

## Putting river height into the formula did not fix it

| Model, same 302 events | Within 2 h | More than 2 h early |
| --- | ---: | ---: |
| Conditions model (release size, gauge height, tributary flow) | 89% | 10% |
| Study 2 model (release size, prior-day release) | 89% | 10% |
| Release size and gauge height | 91% | 9% |
| Release size and gauge flow | 91% | 9% |

A high river is a different regime, not a small adjustment to the same curve.
The gauge's stage reading is comparable across the two periods (5.03 ft
against 5.09 ft at the same flow), so this is not a gauge artefact.

## What separates the misses (post hoc)

These cuts were made after seeing the results above. They describe this data
and are not validated rules.

![Early arrivals](results_conditions/fig2_early_arrivals.png)

| Cut | Events | Within 2 h | More than 2 h early |
| --- | ---: | ---: | ---: |
| Low baseline before the increase (under 1,500 cfs) | 254 | 96% | 3% |
| Baseline 1,500 cfs or more | 48 | 54% | 46% |
| Baseline 3,000 cfs or more | 20 | 10% | 90% |
| Gauge under 7 ft, tributaries steady | 189 | 98% | 2% |
| Same, and under 0.5 inch of rain | 138 | 99% | 1% |
| Gauge under 7 ft, tributaries moving | 14 | 71% | 29% |

The sharpest split is the release level just before the increase. Median
delay was 13.25 hours from a low baseline, 10.4 hours from 1,500 cfs or more,
and 8.25 hours from 3,000 cfs or more. The 1,500 cfs line is a research
cutoff, not Eddy's minimum-flow definition, which is 850 cfs at this dam.

The "normal" group (low baseline, gauge under 7 ft, tributaries steady) is
177 events: 59% of the 302 scored, and 41% of all 432 detected release
increases. It still contains arrivals 7.8 and 5.3 hours early.

## The gate as tested uses information from after the release

Three inputs look ahead, so having the gauges live does not make this filter
available live:

- **"Tributaries steady"** covers the 24 hours after the release starts.
- **Rain** includes the following day.
- **Peak release** is the highest of the first three hours.

Rebuilding the gate from tributary readings in the 12 hours **before** the
release (post hoc) gives 185 events, 97% within 2 hours and 3% more than 2
hours early, with a worst case 9.0 hours early. That worst case is
2024-11-04: tributaries were quiet when the release began, then five inches
of rain sent Crooked Creek past 100,000 cfs and the gauge rose 12 ft. The
other large early arrivals in this group look the same on their hydrographs:
rain fell during the 13 hours the release was travelling, and on 2022-11-04
the release's own sharp rise then arrived on time. On 2023-08-09 the release
was also still climbing after its third hour, so the peak was understated.

So no rule fixed at the moment a release starts can catch these. A live
estimate has to keep checking until the water arrives, and it has to be clear
that it predicts the release arriving, not every reason the river might rise.

## Stepped releases: a small bump, then the main increase

A release was labelled stepped when a smaller increase of 500 cfs or more went
first in the previous 20 hours. These were scored separately.

| | 2025-2026 (16 events) | 2022-2024 (26 events) |
| --- | ---: | ---: |
| Gap between bump and main increase at the dam | 9 h (7 to 14) | 10 h (6 to 17) |
| Gap between first rise and steepest rise at the gauge | 1.25 h (0.75 to 4.4) | 1.1 h (-5 to 6) |
| First rise against a no-bump prediction | 1.6 h earlier | 1.6 h earlier |
| Steepest rise against expected | 0.9 h earlier | 1.4 h earlier |

Brackets are the middle 80%. What this establishes is narrow:

- **Timing is less reliable on stepped days.** The first rise ran about an
  hour and a half ahead of a no-bump prediction, with wide scatter.
- **Whether the two pulses converge is a hypothesis, not a finding.** The
  table compares a detected first rise with the steepest one-hour rise; it
  does not follow each pulse downstream. In 6 of the 28 events from 2022-2024
  the steepest rise came before the "first rise", twice by more than 12
  hours, so the two marks are not reliably the bump and the main increase.
  Smaller releases do travel slower in study 2, which makes convergence
  plausible, but it has not been shown.

## What this supports

- **River height matters, and that part was pre-set.** The height bands were
  fixed before scoring and use only readings from before the release: 94 to
  98% within 2 hours under 7 ft across 203 events in untouched years. The
  5 to 6 ft band alone had 6% early arrivals (5 of 84), so not every low band
  meets the 5% early-arrival mark on its own.
- **Knowing when not to estimate is the firmest result.** On a high river or
  from a raised baseline the rise comes hours sooner, and the error is in the
  early direction.
- **A live conditional estimate is the next thing to test, not a result.**
  The combined gate was chosen after scoring and leans on later information.

## Limits

- The gate (low baseline, 7 ft, steady tributaries) was found after scoring
  and uses later information. It needs a version built only from readings
  available at the time, frozen, and checked on data it has not seen.
- 77 of 432 release increases had an ambiguous match and 13 had none; with
  gauge gaps that left 330 scored. Ambiguity is found in hindsight, so it is
  not a reason Eddy could have known to withhold an estimate. A proper trial
  counts every detected start as issued and evaluated, withheld with a
  reason, or issued with an outcome that could not be determined.
- High-river events are few (29 above 8.5 ft), so there is not enough to build
  a separate high-water estimate yet.
- Still one gauge, 41.5 miles down. Nothing here tests Cotter or Rim Shoals.
- Rainfall is a daily average of station totals over a wide box, which is
  coarse. Tributary flow is the better signal and is what the labels lean on.

## Deviations

None in the scored run. [explore_conditions.py](explore_conditions.py) and its
figures were added after scoring and are labelled post hoc.

Corrected after review on 2026-11-12: the headline no longer says the
conditional estimate holds; the gate's use of later information is stated;
"minimum flow" became "low baseline"; the 8-hour median is attributed to the
3,000 cfs group, not the 1,500 cfs one; availability is given against all 432
detected increases; and the stepped-release convergence is a hypothesis.

## Reproduce

```bash
.venv/bin/python run_conditions.py freeze
```

```bash
.venv/bin/python run_conditions.py score && .venv/bin/python explore_conditions.py
```

Both read the committed snapshots under `data_conditions/`; `sha256sum -c
SHA256SUMS` confirms the inputs are the ones used here.
`fetch_conditions.py` downloads fresh ones from the Corps, USGS and NOAA ACIS.
