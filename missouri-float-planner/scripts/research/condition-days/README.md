# Condition Days

The report at `/blog/research/river-conditions` grades measured flows on read with the shared Eddy classifier. The archive spans January 1, 2006 through December 31, 2025. It stores discharge in cfs and preserves a null for each missing calendar day. An archive year always has 365 or 366 entries. Browser responses contain the selected summaries, not the archive.

## Sources and refresh

- From the web app directory, run `python scripts/research/condition-days/archive.py` to fetch the published sites from the USGS OGC Daily collection. It selects mean discharge (00060 / 00003), approved records only, with no qualifier. Missing, provisional, qualified and negative values are excluded. An upstream error or duplicate date fails the fetch. Review the file diff and run the study tests before publishing.
- `src/data/condition-days/stations.json` identifies the reviewed station/river pair and the November 17, 2026 backup of its production cfs thresholds. The server reads the current pairing when configured. A removed or incomplete pairing disables the report for that station. During a database outage the historical study can still render using the dated thresholds.
- `completed-days.sql` reproduces the completed 2026 Eddy sample. Bind `:sites` to the reviewed USGS site IDs as a Postgres text array. `observations.json` stores the returned raw daily medians as arrays from January 1 through November 16 inclusive. Later completed days are read by station and Central calendar month. After New Year the page starts from January 1 of the new year. A failed read stops the displayed coverage at the last successful month.
- A month counts recorded days. The two-gauge detail counts only dates with both measurements. The seasonal comparison uses one seven-day median per year, requiring four valid days. Annual frequencies give equal weight to years with at least 90% of days and normalize them to 365 days. The current observation can include a flood-stage override. Historical classifications use discharge only.

## Coverage review, November 17, 2026

The first edition contains 101,313 daily measurements at 15 gauges on 10 rivers. Coverage varies by gauge. For example, St. Joe has 3,285 usable days within the study period. At Alley Spring the USGS gauge is upstream of the spring inflow. Eminence measures the spring-fed river downstream. Closing a gap with the other station’s readings would change the question.

The initial review compared monthly shares against each pairing’s existing thresholds. Big River at Richwoods and Byrnesville reached the top band on roughly 54% and 45% of days in their highest month. Current at Van Buren reached 49%, Spring at Hardy 40%, and Gasconade at Hazelgreen 27%. Those pairings are withheld for threshold review. Other high-water outliers, shared proxy gauges, incomplete ladders and stage-only stations were also left outside this edition. The study changes no production rating. Each additional station needs its own source and threshold review.
