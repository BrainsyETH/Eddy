# Finder v3 run: Mark Twain rivers (2026-11-01)

`propose-public-land-access.ts --river=<slug> --out=finder-2026-11/mark-twain/runs/<slug>`,
read-only, one river per run. Same rules as `../README.md` (tier A: a county,
state or US route, or a passenger-grade MVUM road, reaching public riverbank).
The finder now matches NHD names by variant, so "Jacks Fork River" finds
NHD's "Jacks Fork" (`nhdNameFor`).

| River | Candidates | Tier A | Recall (trusted launches with a road candidate within 0.5 km) |
| --- | ---: | ---: | --- |
| Current | 123 | 11 | 34/35 (misses Clubhouse) |
| Jacks Fork | 29 | 7 | 10/11 (misses Bay Creek) |
| North Fork | 36 | 1 | 7/8 (misses Tecumseh / Norfork Lake) |
| Black | 126 | 5 | 12/15 (misses Brookings, Hammer, Lesterville) |
| Huzzah | 27 | 2 | 9/9 |
| Courtois | 24 | 2 | 5/5 |
| Bryant Creek | 45 | 0 | 8/8 |

Each river's `candidates.csv`, `candidates.geojson` and `suspect-records.csv`
are in `runs/<slug>/`. Owner verdicts go in `../reviewed.csv`; reruns leave
reviewed spots out.
