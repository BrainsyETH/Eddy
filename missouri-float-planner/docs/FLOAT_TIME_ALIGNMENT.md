# Float-time alignment and outfitter smoke check

Reviewed 2026-09-16. The app, web planner, embed, nearby routes, chat, MCP and social preparation now resolve estimates through `src/lib/calculations/route-estimate.ts`.

## Behavior

- Exact endpoint validation, database route miles, selected vessel speeds, segment-aware gauges, in-span high-water checks, daily discharge reference, published segment ranges and river-specific low-water curves share one path.
- Unspecified vessels explicitly default to canoe. Previously the first row by sort order was used (raft in seed data), while social assumed canoe. An invalid explicit vessel now fails instead of silently falling back.
- Published ranges take priority; condition adjustments are retained. Incomplete published ranges use the model. Dangerous and dam-controlled routes withhold time before either branch.
- iOS shows both range endpoints, with quarter-hour rounding. The web already did. Long stops and fishing need extra time. Neither upper bound is a guaranteed arrival deadline.
- Social resolves one range during preparation and carries it into caption, reel and cover URL. Captions no longer say “no stops.” Legacy render data without a captured range shows unavailable rather than using the old arithmetic.
- Favorite floats use typical-water canoe estimates, labeled accordingly. Opening a plan uses current water. Unavailable/withheld favorites are excluded from the duration-bearing API so older clients do not receive a null number.
- Share previews store the actual range and label it “Estimated when saved.” Existing average-only plans omit time in previews; their live plan can still recalculate. No invented range from an old average.

## Outfitter comparison

This checks the route service's fallback using published route mileage, seeded vessel speeds and a normal-water assumption. Published-time lookup is intentionally empty: comparing a stored source value to the same source would not validate the model. These sources may already have influenced historical calibration, so this is not an independent statistical validation.

Primary sources:
- [Akers Ferry float trips](https://www.currentrivercanoe.com/crfloats.html)
- [Bass River Resort FAQ](https://bassresort.com/frequently-asked-questions/)

The pages do not clearly specify stop allowances or measured flow. The tolerance is a coarse smoke threshold, selected for this review: ranges must overlap and raw range-midpoint difference must be within 25%. It is not an accuracy guarantee or a fitted acceptance standard.

Sources checked 2026-09-16. Stop assumptions unspecified; normal water is our test assumption.
| Route | Vessel | Miles | Published hours | Eddy range | Midpoint bias | Result |
| --- | --- | ---: | --- | --- | ---: | --- |
| Cedar Grove → Akers | canoe | 8 | 3–5 | ~3h 15m–5h | 4.0% | Close |
| Akers → Pulltite | canoe | 12 | 4–6 | ~4h 45m–7h 45m | 24.8% | Close |
| Baptist Camp → Akers | canoe | 16 | 6–8 | ~6h 30m–10h 15m | 18.8% | Close |
| Akers → Round Spring | canoe | 22 | 7–9 | ~8h 45m–14h | 43.0% | REVIEW |
| Blunt → Bass | canoe | 6 | 3–4 | ~2h 30m–3h 45m | -11.0% | Close |
| Cedar Grove → Akers | raft | 8 | 6–7 | ~4h–6h 30m | -20.0% | Close |
| Blunt → Bass | raft | 6 | 4–6 | ~3h–4h 45m | -22.0% | Close |
| Welch Landing → Akers | tube | 2.5 | 2–3 | ~1h 45m–2h 45m | -13.3% | Close |
| Cedar Grove → Akers | tube | 8 | 8–10 | ~5h 15m–8h 30m | -23.0% | Close |
8/9 close; 1 need review. Published-range lookup is deliberately disabled to avoid testing sources against themselves.
Sources: https://www.currentrivercanoe.com/crfloats.html ; https://bassresort.com/frequently-asked-questions/

The long Akers–Round Spring canoe route fails this threshold. Review its live endpoint mileage and published-segment coverage before adjusting speeds. Several other ranges only partly overlap and have longer or shorter tails; a “Close” result is not evidence that all floaters will arrive within either range. No speed constants were tuned to force a pass.

## Limits and follow-up

This run did not query production endpoint distances, stored segment times or river curves, nor validate old posts already published. It exercises the shared route service against an offline database/provider fixture. Before release, rerun matched endpoints against read-only production data, distinguish published versus model results, and investigate Akers–Round Spring. The default canoe should also be checked against product expectations because the prior implicit default could be raft.

Run from `missouri-float-planner` with Node 20:

```sh
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx scripts/smoke-outfitter-times.ts
```

Add `--strict` to exit nonzero for the known calibration review; ordinary execution reports every row without suppressing outliers.

## Rollout

Migration `20260916120000_float_plan_time_ranges.sql` is pending in the ledger. Apply and verify it before deploying the save endpoint, then regenerate database types. It only adds nullable bounds and a validity constraint; the existing share RPC returns the complete row. This change does not apply a migration or publish social posts. Existing posts remain historical snapshots.

A future offline API cache or already-cached social cover may keep older text until refreshed. Nearby-route details now do more reads to obtain real estimates; measure request latency after deployment.

## Verification

- Web type-check and ESLint pass (existing warnings); token checks pass. `make check-web` reaches the token script but this environment refuses tsx's IPC pipe. The same token checks, Today pretest (14 tests) and full suite (2,652 tests) pass using `node --import tsx` under Node 20.
- `make check-mobile` passes with 28 pre-existing warnings; `make bundle-mobile` exports the iOS production bundle and passes the archive allowlist check.
- Remotion `tsc --noEmit` passes. A still-render attempt could not download Chromium (`storage.googleapis.com` DNS unavailable); visual review of the longer time tiles remains pending.
- No database credentials were available for a production comparison. No migrations, deployments or social posts were executed.

## Review fixes and deployment order

The long-route calculation and its assumptions are intentionally unchanged per
product direction. `/api/route-estimate` now uses the same x402 policy/price as
`/api/plan`. Favorites v2 (`?v=2`, used by the updated app) retains every curated
route, represents withheld/failed estimates with null and a reason, and caches
typical route calculations for an hour independently of CDN misses. The unversioned
endpoint preserves its pre-PR numeric editorial contract for installed clients
that call `durationHours.toFixed()`; no routes are removed. Legacy estimates are
marked `legacy_editorial`; retire v1 when those clients are no longer supported.

Apply the range migration before deploying the save endpoint. Run the read-only
preflight SQL first and regenerate database types after applying it. No production
DB checks or migration were performed in this environment. The explicit default
vessel is canoe; explicit raft/tube selections keep their existing speeds.
