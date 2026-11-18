# Rain to river: how long after rain each gauge crests

A finished study. It asked, for every gauge with a reviewed watershed outline,
how long after a rain over the watershed the gauge starts to rise and crests,
and whether that is steady enough from storm to storm to tell people.

Every gauge has one of two results: a range, or one named reason it has none.
The table is in [results/summary.md](results/summary.md).

| Result | Gauges |
| --- | ---: |
| Range for time to crest | 12 |
| Varies too much from storm to storm | 25 |
| Dam-controlled | 3 |
| USGS serves no discharge (stage only) | 2 |
| Not studied: watershed outline not reviewed | 8 |

No gauge earned a range for time to *rise*. At every gauge the wait from the
start of the rain to the start of the rise varied more than threefold between
storms, typically from an hour or two to most of a day.

## What it replaced

Eight rivers carried a hand-set "hours from local rain to gauge response"
(3 to 10 hours) with no recorded source. They fed Eddy's Read and one chat
hint. Measured, the river typically began rising 4 to 21 hours after the rain
started and crested 13 to 67 hours after half of it had fallen, and at most gauges
on those rivers the time was too variable to state. The estimates are deleted:
the code no longer reads them, and migration
`20261118180000_remove_unsourced_rain_lag_estimates.sql` clears the columns.

The 12 ranges live in `src/lib/rainfall/lag-release.ts`. A test holds that list
to `results/results.json` entry for entry. The weather section adds a sentence
for those gauges only, when rain is in the outlook. It gives the range in
plain days ("a day or two after the middle of the storm"), always with the
number of storms behind it. The hours stay here and in the release list.

## How it was done

1. **Rules first.** [protocol.json](protocol.json) fixes the window
   (2024-11-01 to 2026-11-01), which gauges are in, what counts as a storm and
   as a response, and the rule a gauge must pass. It was committed, with
   `lag.ts` and its tests, before any rain or flow value was read
   (commit `ba38ae56b`).
2. **Rain.** NOAA's gauge-corrected hourly rainfall (MRMS multi-sensor pass 2)
   from its public archive, averaged over each reviewed watershed with the
   same code the public rain view uses. 731 days; the 350 with rain somewhere
   were read hour by hour (8,400 files, none missing).
3. **Flow.** USGS 15-minute discharge, reduced to hourly means.
4. **One pass.** `analyze.ts` applies the rules to every gauge. Nothing was
   tuned afterwards.

A storm is a spell of rain of half an inch or more over the watershed, no
longer than 36 hours, with a dry two days before it. It is timed only when the
river rose by a quarter or more, crested inside the window, and no second rain
fell before the crest. Across the 37 gauges with flow, 8 to 29 storms a gauge
raised the river and were timed.

A gauge gets a range when it has at least 8 such storms, at least 3 in each
year, from more than one season, when most one-inch storms raise it, when the
slow end of the range is no more than three times the fast end, and when the
two years agree. The published range runs from the 10th to the 90th
percentile, rounded outward to whole hours.

## Run it again

```bash
# From missouri-float-planner/. Steps 1 to 4 read public sources and take about half an hour.
node --import tsx scripts/research/rain-lag-2026-11/prepare.ts --work /tmp/rain-lag
node --import tsx scripts/research/rain-lag-2026-11/fetch-rain.ts --work /tmp/rain-lag --shard 0/1
node --import tsx scripts/research/rain-lag-2026-11/fetch-flow.ts --work /tmp/rain-lag
node --import tsx scripts/research/rain-lag-2026-11/build-series.ts --work /tmp/rain-lag
# Step 5 needs only the files in data/.
node --import tsx scripts/research/rain-lag-2026-11/analyze.ts
```

`prepare.ts` reads the research basins from the database (read-only).
`results.test.ts` reruns step 5 on the committed series in the test suite and
fails if the recorded results differ.

| File | What it holds |
| --- | --- |
| `data/basins.json` | The 42 gauges in scope, watershed area, outline hash, rain tile |
| `data/rain-hourly.csv.gz` | Watershed inches for each hour, each studied gauge |
| `data/flow-hourly.csv.gz` | Mean discharge for each hour, each studied gauge |
| `data/sources.json` | What was read: days, file counts, USGS requests and hashes |
| `results/results.json` | Each gauge's result and the numbers behind it |
| `results/storms.csv` | Every storm at every gauge: timed, no response, or set aside and why |
| `results/summary.md` | The results as a table |

## Changes after locking

None. No rule and no line of `lag.ts` changed after the first results.

Two things were fixed in the download scripts before any value was analysed,
and neither touches a rule: USGS does not cut its answer exactly at the times
asked for, so requests overlap by three hours and a reading that arrives twice
is used once; and the flow download goes through `curl`.

After the run, `fetch-flow.ts` was pointed at the repository's one constant
for the older USGS service (`usgs-legacy.ts`) instead of spelling the address
out. That address forwards to the one the requests were answered from, which
is the one recorded in `data/sources.json`. USGS retires this service in early
2027; a rerun after that needs the current API's `continuous` collection.

## Seen afterwards, and not used

Looking at the storm list, small rises seemed to crest at scattered times and
large ones at steadier times. If that were the whole story, a rule that timed
only storms that doubled the river would have given most gauges a range. It
was checked, once, on the same data: 11 of 37 gauges would pass on doubled
storms alone, against 12 under the locked rule. So the spread is not an
artefact of small rises. At most gauges the time to crest really does depend
on the storm: where in the watershed the rain fell, how hard, and how wet the
ground was.

This check changed no result. It is recorded so nobody repeats it expecting a
different answer.

## Limits

- Two years. A gauge's range is from 8 to 24 storms.
- The clock starts when half the storm's rain had fallen over the watershed,
  not at the heaviest hour and not when the rain ended. The two usually sit
  within an hour or two of each other; in one of Patterson's 16 storms they
  were seven hours apart.
- A range is the middle eight in ten storms, so one storm in five fell outside
  it. At Jacks Fork at Eminence, which earned no range, the 21 timed storms
  ran from 2.4 to 51.3 hours against a 10th-to-90th span of 10 to 45.
- The storm count is storms that raised the river. Many did not: above Akers,
  8 of 29 counted storms produced the rise its 14 to 32 hours comes from.
- A range describes past storms. It does not say the next rain will raise the
  river, and it is not evidence that rain has arrived or passed.
- Rain is one average over the whole watershed. Rain near the gauge reaches it
  far sooner than rain in the headwaters; that is a large part of the spread.
- Discharge is as USGS served it on 2026-11-18, provisional values included.
- Niangua at Tunnel Dam sits at a small hydroelectric diversion. It was
  studied like any other gauge and passed.
