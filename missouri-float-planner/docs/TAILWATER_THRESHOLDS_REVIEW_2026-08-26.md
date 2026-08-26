# Tailwater ingestion review — the White, the Norfork tailwater, Lake Taneycomo

Review of `20260824232949_three_tailwaters_land_inactive.sql` and the app wiring
that shipped with it (PR #1252), against the condition-threshold research
proposing ladders for all three reaches.

Reviewed 2026-08-26. Every number below marked *measured* was read from
production, not from the research or the dossiers.

---

## Verdict in one line

The ingestion is sound and its central judgement — **do not invent a rating** —
was right. But leaving `level_*` NULL did not make the three rivers silent. It
made them say **"Too Low - Not Recommended"** at full generation, on public
pages, for two days. That is fixed here. The proposed ladders should **not** be
encoded as written, for a reason the research did not have the data to see: all
three `level_dangerous` values sit inside the dams' ordinary daily range.

---

## 1. What the ingestion got right

Worth stating, because most of this review is about what it missed.

- **Rivers, not reaches.** `controlling_dam_id` and `state` are river-level
  columns and the Norfork tailwater is in Arkansas while `north-fork-white` is
  in Missouri. Clipping `north-fork-white` at the Highway PP bridge, rather
  than leaving 4.8 miles of the same water in two rivers, is the correct call
  and was dry-run before it was applied.
- **The release station as primary gauge.** Verified independently: six USGS
  sites sit below these three dams and every one is a water-quality monitor.
  There is no discharge or stage gauge in any of the three tailwaters. The
  release is not a second opinion.
- **Refusing float times on a tailwater.** The model holds one discharge for a
  whole trip, and the failure is asymmetric — an estimate computed at idle flow
  runs LONG, so it reads as conservative while promising daylight on water
  about to rise. A hard null is right.
- **Refusing to build a ladder from outfitter numbers.** The migration's
  worked example (a page claiming Table Rock runs six turbines at "up to 1,000
  cfs", at a four-unit plant measured at 6,760 cfs the same day) is confirmed
  by the research, which reaches the same refutation from the SWPA schedule and
  a USACE turbine-venting paper.
- **The rating-provenance constraint.** `river_gauges_tailwater_rating_provenance`
  enforces what 20260813005710 only documented. `NOT VALID` is honestly
  reasoned, not a dodge.

The research corroborates the dossiers on every checkable identifier: 3,300
cfs/unit at Bull Shoals (26,400 ÷ 8), 3,600 at Norfork (7,200 ÷ 2), 3,775 at
Table Rock (15,100 ÷ 4), the 185 cfs Norfork siphon, and the 800 cfs Bull Shoals
minimum flow. It adds one thing the dossiers lacked: the USACE Little Rock FEIS
(Nov 2008, rev. Jan 2009) as the citable source for both the 800 cfs and the
300 cfs authorised minimum flows — the district water-control site the dossier
recorded as unreachable was not the only route to that number.

---

## 2. The blocking defect: a null ladder is not silence

**Fixed in this branch** by `20260826120000_an_unrated_gauge_reads_unknown_not_too_low.sql`
and the `hasLadder` guard in `/api/cron/update-gauges`.

Both condition RPCs grade top-down and end in a bare `ELSE 'Too Low - Not
Recommended'`. Every comparison against a NULL threshold yields NULL, which a
`CASE` treats as not-matched — so a gauge with six null levels skips every band
and lands on the fall-through.

`shared/condition-ladder.ts` has always known this. `hasLadder()` exists for it
and its comment says so outright: *"classifyReading would answer `too_low` for
it … which would paint a perfectly healthy river brown on a map."* That guard
was written for the TypeScript path. The SQL path never got one, and the SQL
path is what the river hub page, both OG image routes, `/plan`,
`/api/conditions`, `/api/rivers/[slug]/visuals`, `/api/rivers/[slug]/outlook`
and `/api/og/float` all call.

Measured on production, 2026-08-26, straight out of `get_river_condition()`:

| River | Release at the time | What Eddy said |
| --- | --- | --- |
| `white` | 9,100 cfs | Too Low - Not Recommended |
| `taneycomo` | 6,323 cfs | Too Low - Not Recommended |
| `norfork-tailwater` | 3,310 cfs | Too Low - Not Recommended |

Norfork's 3,310 cfs is a generating unit running in a channel under five miles
long that wades at 204 cfs. The page told a reader to expect gravel bars.

### Why `active = false` did not contain it

`active` gates the river **list**, not the river **page**.
`rivers/[state]/[slug]/page.tsx` loads by slug with no active filter, `sitemap.ts`
enumerates every river row, and `/api/rivers/[slug]` has no filter either. All
three rivers are public and crawlable today. (`/rivers`, `/api/rivers` and
`/api/gauges` *do* filter, so the map and the river list are clean — this is a
page-level gap, not a systemic one.)

`validate_river_data()` also cannot see them: every one of its rules is scoped
`WHERE r.active = true`, so it returns zero findings for all three. The stated
gate — "these rivers cannot be activated until somebody sources a rating" — is
real, but it only guards *activation*. Nothing guarded *rendering*.

### It was also persisted

`/api/cron/update-gauges` classifies with the same ladder and stores the answer.
On 2026-08-25 01:01 it stamped `last_condition_code = 'too_low'` on all three
primaries and wrote an outbox row for each:

```
white              11,399 cfs   unknown → too_low   kind=info
taneycomo           5,155 cfs   unknown → too_low   kind=info
norfork-tailwater   3,211 cfs   unknown → too_low   kind=info
```

Nothing reached a person: `deliver-push` drains only `floatable|warning|easing`,
and `info` is outside `/api/alerts`' default kinds. **The stamp was the damage.**
It is the baseline the next comparison runs against — so the day a real ladder
lands, the next cron pass reads `too_low → high` off a fiction and classifies it
`warning`, which *is* pushed and *is* in the feed. The migration clears it.

### Blast radius of the fix

Exactly three rows. No active river has an all-null primary ladder, and a
*partial* ladder is deliberately untouched: `has_ladder` is the same OR-of-six
that `hasLadder()` uses, so 00150's "Good begins at 400 cfs" rating on the
Gasconade still grades exactly as before. Flood stage stays ahead of the new
guard — an NWS flood stage with no editorial ladder is a fact about the water,
not an opinion about floating it.

Verified against a scratch PostgreSQL 16 cluster with a stub schema: the bug
reproduces before the migration, both RPCs return `unknown` after it, the rated
and partial-ladder fixtures are unchanged, the flood-stage override still wins,
and a second run is a clean no-op.

---

## 3. The proposed ladders, tested against the dams' actual behaviour

The research asks a reviewer to decide whether `level_dangerous` protects
waders or floaters (its recommendation #4). Production answers a prior question:
**as proposed, all three `level_dangerous` values are inside the dams' normal
operating range.**

Every reading Eddy holds for the three release stations (2026-08-24 23:00 →
2026-08-26 01:00, hourly), graded against the proposed ladders:

| Release station | n | Dangerous | High | Flowing | Good | Low | Too Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bull Shoals (`white`) | 27 | **4** | 7 | **0** | 1 | 14 | 1 |
| Norfork (`norfork-tailwater`) | 27 | **7** | 2 | 1 | 17 | 0 | 0 |
| Table Rock (`taneycomo`) | 26 | **2** | 16 | 1 | 0 | 7 | 0 |

Read that as one ordinary late-August day:

- **Norfork would read "Flood — Do Not Float" for a quarter of it.** The
  proposed 3,000 cfs is below one generating unit (measured max 3,310). The
  research's own reasoning says so — "≈1 full generating unit" — but a
  tailwater that shows the red flood otter every afternoon the Corps generates
  has stopped carrying information.
- **The White never once entered its own optimal band.** The proposed
  1,000–2,000 cfs window was empty across the whole window, while 14 of 27
  hours — the minimum-flow floor at 689–800 cfs, the condition the 2009
  Minimum Flow Initiative exists to guarantee and the best wading on the river
  — would have read "Low - Scraping Likely", and one hour "Too Low".
- **Taneycomo would be "High Water - Use Caution" for two thirds of the day**,
  and crossed the proposed 7,000 cfs danger line at 7,454 cfs in routine
  four-unit generation. Table Rock's rated maximum is 15,100 cfs.

### Why the mismatch is structural, not a calibration slip

The research is honest that its bands are wade-fishing bands: the White's
"ideal 800–2,000 cfs" comes from outfitters advising anglers, and above 2,000
those same sources *recommend floating*. Eddy is a float trip planner. Encoding
a wade ladder means badging the best floating water orange and the wade-only
water green — an exact inversion of what the badge means everywhere else in the
product, on rivers where, as the research itself notes, "LOW water is the best
wading."

Two consequences the research flags and the schema makes concrete:

- `level_too_low` is unreachable by construction on two of the three. Norfork's
  siphon guarantees ≥185 cfs and Taneycomo's idle floor is 20 cfs — which the
  research says is "actually prime wading". A `too_low` band that can only fire
  at the river's best condition is worse than no band.
- `level_dangerous` has no source on any reach. No agency and no outfitter
  publishes a hazardous cfs for any of these three, and no documented drowning
  on any of them records the flow. Every candidate value is an inference from
  unit output and channel geometry.

### What would make these encodable

Not more searching — the research's negative findings look thorough and match
the dossiers' independently. What is missing is a **decision**, and the schema
already names who has to make it: `condition_rating_approved_by` and
`condition_rating_approved_at` are `NOT NULL` requirements under
`river_gauges_tailwater_rating_provenance`, and the research leaves both
`PENDING`. Nothing can be encoded until a person signs.

Suggested shape for whoever signs, in preference order:

1. **Anchor the top band on generation, not on a guessed cfs.** "One unit or
   more" is a fact the Corps publishes, `dam-generation.ts` already models it,
   and it is the line every guide on all three rivers actually uses. It also
   generalises: the same rule reads correctly at Norfork's two units and Bull
   Shoals' eight, where a single cfs number cannot.
2. **If a cfs ladder is used anyway, calibrate it from the release history**,
   not from wade-fishing prose — the percentile machinery in
   `percentile-snapshot.ts` and 00171's p90 convention exist for this, and a
   p90 anchor would put "High" where high actually is on a regulated river.
3. **Do not set `level_too_low` on Norfork or Taneycomo at all.** A partial
   ladder is supported (00150) and the honest statement is that these rivers
   have no too-low condition.

Until then, `unknown` is now what they show — which is the outcome the
ingestion intended and did not get.

---

## 4. Smaller findings

**Fixed here:**

- **Norfork's description was out by 4×.** It shipped "when a unit comes on,
  the river roughly quadruples". Measured 204 cfs idle → 3,310 cfs generating:
  **sixteen times**. The sentence sits immediately after the one calling the
  siphon "what makes it wadeable", so it reads as a bound on how much worse
  things get when a unit starts — understated fourfold, on a five-mile channel
  where wading is the whole point. Corrected in `rivers.description` and in
  `EDDY_KNOWLEDGE.md`, which carried the same claim into every chat answer.
- **Taneycomo's dissolved-oxygen line** said "about half again as high" ten
  miles down; the dossier's own figures are 5.1 → 9.2 mg/L, close to double.
- **The Bull Shoals dossier said "~78 river miles"** where the geometry it
  documents measures 90.46, which is what `rivers.length_miles` carries and
  what the research independently reports (90.5). An estimate written before
  the cut, left standing next to the cut's own number.

**Not fixed — flagged for a decision:**

- **Zero approved access points on all three rivers.** `white` is 90 miles with
  no put-in. The research supplies a sourced list for each (AGFC accesses on
  the White; Quarry Park / Bill Ackerman / Norfork Access on the Norfork; MDC
  hatchery, Cooper Creek, Branson and Rockaway Beach on Taneycomo), and
  `propose-tailwater-access-points.ts` exists to ingest them. Worth doing
  before activation regardless of the ladder question — a float planner with no
  endpoints cannot plan a float.
- **The provenance constraint keys on `role`, not on the river.** A CHECK
  cannot read another table, which the migration says. The gap it leaves is
  real: a gauge added to a `dam_tailwater` river with `role = NULL` — the
  default for anything the 20260813005710 backfill did not cover, i.e. any new
  USGS gauge — may carry a full ladder with no rating provenance at all, and
  if it is `is_primary` the river can then be activated. Closing it needs a
  trigger or a `validate_river_data()` rule, not a CHECK.
- **`validate_river_data()` is blind to inactive rivers.** Every rule is scoped
  `WHERE r.active = true`. That is defensible for thresholds, less so for the
  structural rules (geometry, gauge wiring, access points) — an inactive river
  is precisely the one being prepared, and the checks that would catch a
  mistake before activation are the ones that do not run until after it.
- **Bull Shoals nameplate: three sources, three numbers.** The registry's 340 MW
  is well argued from the Corps' own Major Equipment Replacement fact sheet;
  the research says 380; SWPA schedules 391. No change made — the registry
  comment already records the disagreement and picks the best source. Noted so
  the next reader does not "correct" it to the research's figure.

---

## 5. What this branch changes

| File | Change |
| --- | --- |
| `supabase/migrations/20260826120000_…unknown_not_too_low.sql` | Both condition RPCs return `unknown` for an unrated gauge; clears the three `last_condition_code` stamps and the three manufactured outbox events; corrects the Norfork description. **Not applied to production** — needs authorisation. |
| `src/app/api/cron/update-gauges/route.ts` | `hasLadder` guard before `computeCondition`, so the cron stops manufacturing and persisting a condition for an unrated gauge. Reports `unratedGaugesSkipped`. |
| `src/lib/conditions/unrated-gauge.test.ts` | Pins the trap, the 00150 partial-ladder exemption, the cron guard, and the SQL guard in whichever migration most recently defines each RPC. |
| `EDDY_KNOWLEDGE.md` | Norfork's "quadruples" → sixteenfold; Taneycomo's DO ratio. |
| `scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-bull-shoals-dam.md` | 78 → 90.46 river miles, with the reason it was wrong. |

The migration is written and verified against a scratch cluster but **has not
been applied to production**; the three rivers still read `too_low` there until
someone applies it.
