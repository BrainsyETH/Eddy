# Gauge + alerting misalignment audit

Diagnosis of the Huzzah Creek (USGS 07014000) case: an alert set at "rises above
81 cfs" stayed silent while one screen read 87 cfs and another read 80 cfs at the
same minute. Nothing here is a crash or an exception — every finding is a place
where two subsystems each behave as documented and disagree with each other.

Read with `src/lib/alerts/gauge-readings.ts`, `src/lib/alerts/gauge-threshold.ts`,
`src/lib/alerts/rule-seed.ts`, and `eddy-ios/app/alerts/configure.tsx`.

---

## 1. Three answers to "what is this gauge reading right now"

Migration 00196 split gauge storage into two tiers on purpose, and the split is
sound. What was never settled is which tier each surface reads. Today:

| Surface | Endpoint | Table |
| --- | --- | --- |
| Search rows (curated), Map, Favorites, Reports | `/api/gauges` | `gauge_readings` |
| Gauge detail screen, alert configure screen | `/api/gauges/[siteId]` → `search_gauges` | `gauge_latest` |
| Search rows (national tier) | `/api/search` → `search_gauges` | `gauge_latest` |
| National map pins | `/api/gauges/map` | `gauge_latest` |
| **Alert seeding and evaluation** | `loadLatestReadings()` | **both, newest wins** |

`gauge_readings` is appended by `update-gauges` hourly, and every 15 minutes when
a river is rising fast. `gauge_latest` is overwritten by `sync-gauge-latest` on a
single hourly pass at `:20` that takes ~2.5 minutes to walk ~16,500 stations. For
a **curated** station the two are both live and routinely disagree, and the
curated tier is the fresher of the two by design — that is the whole reason
`loadLatestReadings` merges them.

That is the 87-vs-80 in the screenshots. Same station, same minute:

- Search row: **87 cfs, "Updated an hour ago"** — `gauge_readings`, via the local
  `/api/gauges` list. (`reports.tsx` renders a curated hit as `GaugeRow` from
  `curatedById`, because only that endpoint carries the ladder needed for the
  "Good" chip.)
- Gauge detail: **80 cfs, "Updated 2 hours ago"** — `gauge_latest`, via
  `search_gauges`.

Neither screen is wrong about its own source. There is simply no defined answer
to which one the product means by "now".

**Fix direction:** one reader. Promote `loadLatestReadings`' merge semantics
(newest timestamp across both tiers) into the read path — either as a
`gauge_current` view that `search_gauges` left-joins instead of `gauge_latest`,
or by having `/api/gauges/[siteId]` fold in the curated row the way the alert
engine already does. The alert engine's rule is the correct one; the read path
should adopt it rather than the other way round.

---

## 2. Why the 81 cfs alert never fired

This is finding 1 turned into a silent failure, and it is the actual bug behind
the report.

1. The configure screen anchors its "RIGHT NOW" from `fetchGaugeDetail`
   (`configure.tsx:159`) → `gauge_latest` → **80 cfs**. It pre-fills the
   threshold field with that number (`anchorFor`, `configure.tsx:275`).
2. The user types **81** — deliberately one step above what the screen shows.
3. On save, `seedCrossingState` (`rule-seed.ts:54`) calls `loadLatestReadings`,
   which merges in `gauge_readings` and picks the newer row: **87 cfs**.
4. `thresholdState({comparator: 'above', threshold_value: 81}, 87)` → **`inside`**.
   The rule is written to the database already on the far side of its own
   threshold.
5. `evaluateSubscription` is edge-triggered by design
   (`gauge-threshold.ts:475`): it fires only on `outside → inside`. A rule born
   `inside` is skipped as `no_crossing` on every pass, forever.
6. Re-arming requires hysteresis: with `HYSTERESIS_FRACTION` 0.02 and
   `HYSTERESIS_MIN_CFS` 1, the water must fall to **≤ 79.38 cfs** before the rule
   goes `outside` and becomes capable of firing again.

The user set an alert one unit above the number on their screen and got a rule
that can only speak after the creek drops ~8%. No error, no warning, no visible
state.

The edit path has the same hole with an extra twist. `[id]/route.ts:106` re-seeds
on any threshold change and the UI says so — *"Changing the level starts the alert
fresh from the latest reading"* (`eddy-ios/app/alerts/[id].tsx:308`). It is a true
sentence about a **different** latest reading than the one the app showed.

**Fix direction:** the screen the user types into and the code that seeds the rule
must read the same number. Fixing finding 1 fixes this. Until then, seeding
should at minimum be reported back (finding 3).

---

## 3. The seed is computed, returned, and thrown away

`POST /api/me/gauge-alerts` already anticipated exactly this failure. Its header:

> Seeding here closes both, and returning the seed lets the app SAY so instead of
> looking broken.

The plumbing is half-built:

- The route returns `seed: { value, unit, readingAt, state }` (`route.ts:314`).
- `AlertRuleSeed` and `AlertRuleResponse.seed` exist in `src/types/api.ts:1034`.
- **The iOS app never reads it.** There is no reference to `seed` anywhere in
  `configure.tsx`, `alerts/[id].tsx`, `useAlertRules.tsx`, or `api/client.ts`.
- **`PATCH` hardcodes `seed: null`** (`[id]/route.ts:157`) even on the branch that
  just re-seeded the rule and computed a `seed.state`.

So the one signal that would have told the user "you're already above 81 — this
won't fire until it drops below ~79" is generated on the server, serialized on
the create path, discarded on the edit path, and ignored on both.

**Fix direction:** return the real seed from PATCH, and render `state === 'inside'`
on both screens as a plain sentence under the field ("Huzzah Creek is already at
87 cfs. This alert will fire the next time it comes back up past 81."). Cheap,
and it converts a silent rule into an informed choice.

---

## 4. `last_state` never leaves the server

`GAUGE_ALERT_SELECT` (`rule-serialize.ts:57`) selects `last_triggered_at` and
`one_shot_fired_at` but **not** `last_state`, `last_value`, `last_reading_at`, or
`last_evaluated_at`. `toGaugeRule` therefore cannot expose them, and no client
can ever distinguish:

- a rule that is armed and waiting, from
- a rule sitting `inside` that will never fire, from
- a rule whose station has stopped reporting and is being skipped as `no_reading`
  or `gated` on every pass.

All three render identically as "Active · Watching for changes" — which is what
the edit screen in the report shows for a rule that is structurally incapable of
firing.

Note also that the edit screen displays no reading at all. The create screen has
a "RIGHT NOW" card; the edit screen has `Currently: when it rises above 81 cfs`
and nothing to compare it against.

**Fix direction:** add the four columns to `GAUGE_ALERT_SELECT` and to
`AlertRule`, and give `AlertRuleRow` / the edit screen a third state beyond
active/paused.

---

## 5. Staleness thresholds disagree across the stack

Three different definitions of "too old", none aware of the others:

| Where | Limit | Behaviour past it |
| --- | --- | --- |
| `gate.ts:36` (alert engine, USGS) | **3h** | rejects — rule skipped as `gated`, silently |
| `gauges/[siteId]/route.ts:60` | **6h** | triggers a live USGS refetch |
| `offline-cache` `mayPaintCachedCondition` (iOS) | ~6h | stops replaying cached verdicts |

Between hours 3 and 6 the app displays a reading with a confident condition chip
while the alert engine has already stopped acting on it. And because the
configure screen prints "RIGHT NOW 80 cfs" with **no age at all** — the same
number the gauge screen labels "Updated 2 hours ago" — someone can set a
threshold against a reading the engine would refuse, and nothing on screen hints
at it.

**Fix direction:** one constant, exported from `shared/`. Show the reading age on
the configure screen's "RIGHT NOW" card, matching the gauge screen's wording.

---

## 6. 07014000 is `is_primary = true` for two rivers

Migration 00164 inserts the station against **both** rivers with `is_primary`
true — huzzah at line 58, courtois at line 87. Every consumer resolves "the
river" with `find((t) => t.isPrimary)` or a `Number(b.isPrimary) - Number(a.isPrimary)`
sort. With two true rows both are no-ops: the winner is whatever order Postgres
happens to return.

Visible in the screenshots — the gauge screen reads `USGS 07014000 · Courtois
Creek` and offers **"Open Courtois Creek"**, while the alert on the same station
is titled **Huzzah Creek**. Same station, two names, one session.

This is more than cosmetic. `river_gauges` holds the ladder *per pairing* —
00196's comment says so explicitly, and 00200 keys the evaluator's ladder map on
`(river, station)` precisely so "grading a Courtois rule against the Huzzah's
bands would be silently wrong rather than visibly broken". The evaluator holds
that line. The **client** does not: a condition-mode alert created from the gauge
screen picks up whichever `riverId` the arbitrary `find` returned.

**Fix direction:** a partial unique index — `unique (gauge_station_id) where
is_primary` — plus a data migration demoting the courtois pairing to
`is_primary = false` (it is the 5.0-mile proxy association; huzzah is the 0.0-mile
one). Then re-check every `find(isPrimary)` call site for a deterministic
fallback.

---

## 7. Mode is immutable after creation

Minor, but it explains the two different-looking screens in the report. Create
(`configure.tsx`) offers **Eddy's call** vs **My own level**. Edit
(`alerts/[id].tsx`) offers only above/below/between, and `PATCH` accepts
`conditionKind` on a condition rule and threshold fields on a threshold rule —
never a switch between them (`[id]/route.ts:64-71`).

A rule created as "Eddy's call · Safety" can only become a threshold rule by
being deleted and recreated, and the edit screen gives no indication that this is
why the mode picker is missing.

---

## Suggested order

1. **Finding 6** — one-line data fix plus an index; removes a wrong river name
   and a non-deterministic ladder today.
2. **Finding 3** — return the seed from PATCH and render it. Turns the silent
   failure into a visible one without changing any semantics.
3. **Finding 1 / 2** — unify the read path on the merge the alert engine already
   performs. This is the root cause; the rest are symptoms or mitigations.
4. **Findings 4, 5, 7** — state on the wire, one staleness constant, mode editing.
