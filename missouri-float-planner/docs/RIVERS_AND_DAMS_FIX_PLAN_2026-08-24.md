# Bug-fix plan — rivers & dams, 2026-08-24

Companion to `RIVERS_AND_DAMS_REVIEW_2026-08-24.md`, which carries the
evidence. This file is only the work: **defects and the guards that would
have caught them.** No ingestion, no expansion, no editorial backfill.

| In scope | Out of scope — separate session |
|---|---|
| The dam recorder's filter dropping three dams | Tailwater onboarding (White, North Fork, Taneycomo) |
| A CI guard tying the registry to that filter | Bagnell/Ameren history path |
| A dam-freshness check in the trust ledger | Elk River activation, any new river |
| Threshold tie on Jacks Fork | Montauk — needs the Current line extended upstream (NHD import) |
| A dead gauge wired to a live river | 79 missing access-point descriptions, 12 rivers with no hazards |
| `controlling_dam_id`: wire or drop | 92 pending access points awaiting review |
| Three lateral-snap pins on the Niangua | New dams, new districts |
| Eleven Point float-camp eligibility | |
| War Eagle `length_miles` (diagnose first) | |

Everything below is on `claude/rivers-dams-review-1sl199` unless noted.

---

## Tier 1 — code defects

### 1. The history recorder drops the three Cumberland dams — **do this first**

**File:** `src/app/api/cron/sync-dam-history/route.ts:176-178`

```ts
const dams = Object.values(USACE_DAMS).filter(
  (d) => hasPowerhouse(d) && d.office && d.cdaLocation
);
```

The LRN entries carry `cdaLocations` (plural) — the split-prefix shape
`8ccfbf6` introduced because no single prefix spans a project's tailwater and
pool stations. They have no `cdaLocation`, so all three are dropped.
`seriesFor()` already reads both shapes
(`dam.cdaLocations ?? (dam.cdaLocation ? [dam.cdaLocation] : [])`, `dams.ts:213`),
which is why the dam pages still render live metrics while the recorder is blind.

**Change:** widen the predicate to accept either shape. Extract it so the
guard in item 2 can assert against the same expression rather than a copy:

```ts
export function recordsHistory(d: UsaceDam): boolean {
  return Boolean(hasPowerhouse(d) && d.office && (d.cdaLocation || d.cdaLocations?.length));
}
```

**Then backfill.** `GET/POST /api/cron/sync-dam-history?backfillHours=192`
with `Authorization: Bearer $CRON_SECRET`. Capped at `MAX_BACKFILL_HOURS`
(90 days); 192 h covers the ~53 h gap with margin.

**Recoverability, measured 2026-08-24:** `RWNK2-WOLF_CREEK.Flow-Turbine…`
returns 354 hourly points from 08-10T00:00Z through 08-24T17:00Z. The entire
gap since 08-22 16:00 is recoverable **today**, and LRN's window is
empirically ~15 days, not the rolling week the route comment assumes. That is
slack, not safety — this is the only data in the system that cannot be
reconstructed later.

**Verify:** after the backfill, `max(observed_hour)` per LRN dam is inside
2 h, and each has ~2 metrics × the backfill window in `dam_metric_readings`.
Wolf Creek's `generationFlow` and `release` are 0% identical today, so a
backfill that lands them equal means the wrong series resolved.

**Risk:** low. The upsert is idempotent on the primary key, which is what the
route's own overlapping re-read relies on.

---

### 2. Nothing ties the registry's shape to the recorder's filter

The LRN dams satisfied every test in the suite — `dam-catalog-parity`,
`usace-registry.test.ts`, `dams-route-contract` — while being invisible to
the recorder. The filter is the only place that shape matters, and nothing
asserted against it.

**Change:** a test beside `usace-registry.test.ts` asserting that every dam
with a declared, non-`dailyMean` `release` or `generationFlow` series passes
`recordsHistory()`. Roughly:

```ts
test('every dam with an hourly history series is one the recorder will read', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    const hourly = (['release', 'generationFlow'] as const)
      .some((m) => dam.series[m] && !dam.series[m]!.dailyMean);
    if (!hourly) continue;
    assert.ok(recordsHistory(dam), `${dam.id} declares hourly history the recorder will never fetch`);
  }
});
```

This is the cheap half of the guard: it runs in `make check-web` and would
have turned the 08-22 merge red in CI. It cannot see dams whose series
resolve at runtime (the eight SWT projects carry empty `series`), which is
what item 3 is for.

---

### 3. The trust ledger does not watch the dam layer

Eleven checks are registered in `src/lib/trust/registry.ts`; none touches
`dam_metric_readings`, the SWPA scrape or Ameren. That is why item 1 ran 53
hours in silence.

**Change:** a `dam_freshness` check in `src/lib/trust/checks/`, registered in
`TRUST_CHECKS`. Cadence is free — the registry comment notes checks drain
from one cron path rather than costing a Vercel slot.

**Scope it off the table, not off the registry.** The naive version — "assert
a reading for every dam the cron claims" — fires forever on Mark Twain, which
passes the filter but has never written a row and never will: its release is
`dailyMean` (skipped by design) and it declares no turbine series. A
permanently red check trains people to ignore the ledger, which recreates the
original failure.

So: **a dam that has ever written history is expected to keep writing.**

```sql
select dam_id, max(observed_hour) from dam_metric_readings group by dam_id
```

- `> 6 h` → `medium`
- `> 24 h` → `high`

New dams enrol themselves on first write; dams that legitimately never record
are never expected. Measured band today: 15 dams sit at 2.1–4.1 h, so 6 h
leaves ~2 h of headroom over the observed worst normal case.

The blind spot is a dam that *should* record and never has — Bagnell. That is
a coverage gap rather than a regression, it belongs to the ingestion session,
and item 2 covers the static half.

**Siblings, same file, if cheap:** SWPA file date (it already fails closed at
fetch, but a closed fail is currently invisible) and Ameren reachability
*from Vercel egress* rather than from a build box.

---

## Tier 2 — data corrections with a determinate answer

### 4. Jacks Fork threshold tie

`07065200` (Mountain View): `level_low` = `level_optimal_min` = 100 cfs. The
one `error`-severity row `validate_river_data()` returns. A tie, not an
inversion — one of the two values moves. Take the replacement from the same
source the rest of that gauge's band came from rather than picking a
round number.

Migration, then confirm `validate_river_data()` returns no `error` rows.

### 5. A dead gauge is wired to a live river

`06928900` (Big Piney River near Houston) is `active = false`, has **never**
had a reading, and is still linked to Big Piney as a secondary gauge carrying
a full six-threshold set. Unwire the `river_gauges` row. Big Piney keeps
`06930000` as primary, which is 2.2 h fresh.

Worth a moment's thought on whether `gauge_wiring` should have caught this —
if the answer is "it checks wiring but not liveness", that is a one-line
addition to an existing check rather than a new one.

### 6. `controlling_dam_id` — wire it or drop it

Shipped 2026-08-13 with a comment describing a validation that does not
exist: "matched against the release gauge station's `site_id_external` at
validation, so a tailwater cannot be wired to a neighbouring project's
outflow." NULL on all 25 rows, referenced by no code outside the generated
`database.ts`. The Black — the one river that *is* a tailwater — takes its
link from the registry's `tailwater` field instead.

Two honest options; pick one and land it:

- **Drop the column.** The registry already owns the dam→river direction and
  is the side with the type safety.
- **Wire it**: set it on `black`, and add the described assertion to
  `validate_river_data()` so the comment becomes true.

A column that documents a guarantee it does not provide is worse than no
column. Do not leave it a third time.

---

## Tier 3 — corrections needing a ground-truth call

Bounded research on existing rows. Not ingestion, but each needs a decision
before a migration can be written.

### 7. Three Niangua pins sit laterally off the river line

| Point | snap | position along line | recorded mile |
|---|---|---|---|
| Ha Ha Tonka State Park | **7 765 m** | 0.9941 | 79.5 |
| Whistle Bridge | 1 769 m | 0.9451 | 68.0 |
| Mother Nature's Riverfront Retreat | 1 525 m | 0.9989 | 70.0 |

**This is not the Montauk case.** Montauk clamps to fraction 0.0000 — the
line stops short of it, which is a geometry import. These three land on the
line's *interior* (0.945–0.999), so the line runs past them and the pins are
simply 1.5–7.8 km to the side of it. The Niangua's stored length and its
geometry agree exactly (92.3 mi / 92.3 mi), so the line is not the suspect.

The likely reading, which must be confirmed before anything is written: the
lower Niangua is the Niangua *arm of Lake of the Ozarks*, and these three sit
on impounded water rather than the free-flowing river the line traces. Ha Ha
Tonka State Park in particular is a lake park.

Per point, decide: bad coordinate → fix it; on the lake rather than the
float river → it is not an access point on this river and should not be
`approved` + `is_float_endpoint` with a fabricated mile. All three are
currently offered in the put-in/take-out picker with miles derived from a
line they are kilometres away from — a 7.8 km error on a 92-mile river is a
float plan wrong by hours.

Clearing these also clears the three `access_point_not_snapped` warnings and
leaves Montauk as the only one, correctly, awaiting its geometry.

### 8. Eleven Point float camps offered as put-ins

Seven float camps, all `is_float_endpoint = true`:

| Camp | mile | `types` | flagged? |
|---|---|---|---|
| Denny Hollow | 6.5 | `[campground]` | yes |
| Horseshoe Bend | 26.5 | `[campground]` | yes |
| Barn Hollow | 27.0 | `[campground]` | yes |
| Whites Creek | 28.5 | `[campground]` | yes |
| Morgan Spring | 43.3 | `[campground]` | yes |
| **Greenbriar** | 31.0 | **`[]`** | **no** |
| Boze Mill | 33.4 | `[access, campground]` | correctly a launch |

Five raise `non_launch_offered_as_endpoint`. Decide per camp: if it has a
gravel bar or ramp somebody actually launches from, add the `access` role; if
it is a place to stop rather than start, `is_float_endpoint = false`. The
check's own text names the trap — Montauk was reclassified on a
park-boundary reading and turned out to be the Current's first put-in.

**Handle Greenbriar in the same pass.** It is offered as a put-in with
`type = 'float_camp'` and an empty `types` array, and the check skips it
because `roles.length > 0` is false. That skip is deliberate and documented
(97 approved rows still carry empty `types` while the ADR 0008 roles axis is
unpopulated) — so this is a known limitation, not a bug to fix here. It does
mean Greenbriar needs the same decision without the ledger asking for it.

### 9. War Eagle Creek — `length_miles` vs geometry

Stored 33.2 mi; the line measures 68.1 mi. Open in the ledger since 08-06 and
by far the largest disagreement — the next worst is Courtois at 9%.

Single `LineString`, 261 points, so it is not a multipart or doubled-back
import artifact. 33.2 mi is plausibly the floatable reach; 68.1 mi is longer
than War Eagle Creek runs at all, which points at the geometry carrying
something extra rather than at the stored number being wrong.

**Diagnose before deciding, and split on the answer:**

- The stored number is wrong (the line is right) → update `length_miles`.
  **In scope, lands here.**
- The line is wrong (extra tributary, wrong NHD reach) → re-import.
  **Out of scope — hand it to the ingestion session with the diagnosis
  attached.**

Do not "fix" this by writing 68.1 into `length_miles` to silence the check.

---

## Sequencing

1. **Item 1** — today, while the window is open. Ship the filter fix, deploy,
   run the backfill, confirm the three dams are fresh.
2. **Items 2 and 3** — same branch, right behind it. Neither is useful after
   the next regression instead of before it.
3. **Items 4, 5, 6** — one migration each, independent, any order.
4. **Items 7, 8, 9** — after the decisions are made. Item 9 may exit scope.

Items 1–3 are the ones that close the hole. 4–9 are the backlog the audit
surfaced; none of them is losing data while it waits.

## Validation

- `make check-web` for every code change — the new test in item 2 is part of
  it, and web tests intentionally cover `packages/` and iOS pure logic.
- `make check-db` after any hand-applied migration, per CLAUDE.md.
- `npm run db:validate -- --strict` after items 4, 5, 7 and 8.
- Writes are pin-gated: export `EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur`
  in the live shell. Nothing here should be applied to production without
  reading the dry run first.
- The backfill in item 1 is the one step whose success is measured in the
  database rather than in CI — check `max(observed_hour)` per dam before
  calling it done.
