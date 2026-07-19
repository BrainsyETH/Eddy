# CFS Migration — Derived Thresholds (working data)

Gathered 2026-07-12 for the CFS flip (migration 00166, pending). Do not deploy the
CFS flip without the unit-independent flood override (both app `classifyStageFromThresholds`
and the DB `get_river_condition*` RPC) — dangerous is anchored to the official NWS flood
STAGE (ft), backfilled in 00165.  CFS bands: too_low=p10 low=p25 opt_min=p50 opt_max=p75 high=p90.

> **Recalibration (00171):** the condition classifier uses `optimal_max` as the
> "high" onset, so the original `optimal_max = p75` fired "HIGH WATER" above the
> 75th percentile of flow — far too often (e.g. Niangua went "High" at 191 cfs,
> ~1.6× its 117 cfs median). Migration `00171_cfs_high_onset_p90.sql` raises
> `optimal_max` to **p90** (copies the already-stored `level_high`) so "high"
> fires only in the top ~10% of flow. **Future CFS flips must set
> `optimal_max = p90` (the high onset), not p75.** The floatable "flowing" band
> is then p50–p90.

| USGS | Gauge | role | too_low | low | opt_min | opt_max | high | dangerous |
|---|---|---|--:|--:|--:|--:|--:|--|
| 07067000 | Current @ Van Buren | primary | 704 | 885 | 1180 | 1630 | 2000 | NWS flood-stage (ft) override |
| 07064533 | Current @ Akers |  | 198 | 235 | 308 | 411 | 909 | NWS flood-stage (ft) override |
| 07068000 | Current @ Doniphan | ALREADY cfs (moherp) — keep | — | — | — | — | — | — |
| 07071500 | Eleven Point @ Bardley | primary | 301 | 420 | 588 | 804 | 1120 | NWS flood-stage (ft) override |
| 07065495 | Jacks Fork @ Alley Spring | primary | 56 | 74 | 97 | 141 | 482 | NWS flood-stage (ft) override |
| 07065200 | Jacks Fork @ Mtn View |  | 34 | 39 | 45 | 86 | 697 | NWS flood-stage (ft) override |
| 07066000 | Jacks Fork @ Eminence |  | 121 | 155 | 221 | 276 | 446 | NWS flood-stage (ft) override |
| 06923250 | Niangua @ Windyville | primary | 31 | 46 | 117 | 180 | 541 | NWS flood-stage (ft) override |
| 06923950 | Niangua @ Tunnel Dam |  | 90 | 142 | 234 | 441 | 754 | NWS flood-stage (ft) override |
| 06930000 | Big Piney @ Big Piney | primary | 123 | 149 | 194 | 263 | 407 | NWS flood-stage (ft) override |
| 07013000 | Meramec @ Steelville | primary (post-fix) | 131 | 162 | 224 | 322 | 533 | NWS flood-stage (ft) override |
| 07014000 | Huzzah/Courtois | primary | 56 | 66 | 111 | 169 | 373 | ~750 cfs editorial (no NWS point) |

Notes:
- Doniphan (07068000) is already CFS from moherp — do not overwrite.
- Existing ft `level_*` move into `alt_level_*` on flip; `threshold_source` stays honest.
- Sanity: Van Buren today ~1080 cfs → 'good' (between low 885 and opt_min 1180). Huzzah today
  ~1080 cfs is ~3x its p90 (373) → correctly flags high/dangerous (creek flooding after rain).
- NWS action/flood stages (ft) already committed in 00165_backfill_nws_flood_stages.sql.
- Secondary Current gauges 07064440 (Montauk) / 07066510 (Powder Mill) and Meramec 07019000/
  07014500/07010350 still need percentiles fetched before flipping (kept ft until then).
