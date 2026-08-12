# Tailwaters — the execution plan

**Status: active plan.** Companion to `WATER_REGIMES_STRATEGY.md`, which argues
*why* regulated water is worth building; this argues *what to build next and in
what order*. Written August 2026 against the shipped dam layer.

**Audience decision, made explicitly:** the dam section is for **tailwater
anglers first**. Floaters and lake users are served, but when two designs
conflict, the wading angler wins. That decision is what orders everything below,
and it is why the dam card now leads with the water *below* the dam and treats
the pool as context.

---

## Where this stands

`WATER_REGIMES_STRATEGY.md` sequenced five steps. Steps 1 and 2 are done — the
two-source dam layer ships, and `src/lib/usace/resolve.ts` replaced hardcoded
timeseries ids with a catalog resolver. What follows here is steps 3 and 4, plus
a prediction layer that document did not anticipate.

### Shipped this session

| Change | Why it was cheap |
|---|---|
| **Next scheduled change** — "Water on at 3 PM", "Water off at 10 PM" | `idleWindows()` already computed the pattern; nothing surfaced *when it next flips*. Pure function in `shared/dam-schedule-copy.ts`, so web and iOS share it. |
| **Tailwater stage + 3-hour movement** | `fetchLatestValue` already fetched an 8-hour window and discarded all but the last point. The series was declared in the registry from day one and read by nothing. |
| **Inflow** | Same: declared, resolvable, never in `SNAPSHOT_METRICS`. |
| **`dailyMean` on resolved series** | A bug the above exposed — see below. |

Two things worth keeping in mind from that work:

**Stockton and Truman now have a live state line at all.** The Kansas City
district publishes no CWMS timeseries, so those two had no generating chip and
no metrics — just a schedule further down the page. The scheduled-change line is
derived purely from SWPA, so it works for exactly the projects CWMS abandons.

**A resolved series can be a daily mean, and nothing was flagging it.** The
registry marks `dailyMean` by hand for the two St. Louis dams. The resolver has
nobody to mark it, and its specs admit `~1Day` for both release and inflow —
Wappapello's and Mark Twain's inflow resolve to exactly that. Adding inflow to
the snapshot would have rendered a day-old average as a reading taken just now.
`dailyIntervalHints()` now reads the interval out of the resolved id. **Any
future metric added to `SNAPSHOT_METRICS` inherits this hazard**; check what the
resolver actually picks before shipping it.

---

## Measurements taken 2026-08-12

Recorded because they decided designs, and because re-deriving them costs an
afternoon.

### Tailwater stage swings 8 feet, and that is the signal

48 hours of hourly tailwater elevation against turbine flow:

| Dam | Swing, idle to full generation |
|---|---|
| Table Rock | **8.19 ft** (702.60 → 710.79) |
| Bull Shoals | **7.67 ft** (450.66 → 458.33) |

This is the largest, fastest-moving number the dam layer has access to, and
unlike the schedule it is an **observation** — it catches water nobody
announced. It is the strongest raw input available to everything below.

### No threshold separates "rising" from "steady"

7 days of hourly stage at Table Rock, Bull Shoals, Norfork, Greers Ferry and
Beaver, 3-hour change classified by whether the whole window was idle:

```
POOLED idle  n=351   p90=0.52 ft   p95=1.45 ft   p99=4.00 ft
POOLED gen   n=470   p10=0.02 ft   p25=0.23 ft   p50=2.32 ft
```

The distributions overlap across the entire range a threshold could sit in. Idle
windows include the recession limb after a shutdown (Greers Ferry hit 4.96 ft
while idle); steady generation holds the tailwater high and *flat* (a quarter of
generating hours moved under 0.23 ft).

**Therefore the card shows a signed number, not a verdict.** "−2.6 ft in 3h"
needs no threshold and cannot be wrong; "falling" would have been confidently
wrong a good fraction of the time. This finding generalises: **resist
categorical labels on regulated water.** The whole reason the ladder is the
wrong primitive here is the same reason a trend label is.

### The CDA fetch cache never hits

`fetchLatestValue` builds `new Date()` for both ends of its window, and
`timeseriesUrl` serialises them at millisecond precision. Every call is
therefore a unique URL, so `next: { revalidate: REVALIDATE_SECONDS }` in
`cda.ts` can never produce a hit — not across dams in one render, not across the
index and detail pages, not across `/api/dams` calls from iOS.

The SWPA scraper does not have this problem (fixed URL per weekday), which is
why the comment on `fetchAllDamSnapshots` about the cache collapsing requests is
true there and not for CWMS.

**Fix:** floor `begin`/`end` to a bucket (five minutes would do) so repeated
reads of the same series share a URL. Deliberately *not* done in the same change
as the metric work — it alters the freshness characteristics of every dam
reading at once and deserves its own diff and its own measurement. It gets more
valuable as metrics are added, and seven metrics × twenty dams is already a lot
of uncached fan-out per revalidation.

---

## 1. Travel-time lag — learn it, do not assume it

**The gap:** SWPA says the units run 7–11 AM *at the dam*. Nothing says when
that water reaches the access someone is standing at. Every wade/float window
downstream of the dam face is wrong without this, and a hand-tuned celerity per
reach is exactly the curation cost `RIVER_SCALING_PLAYBOOK.md` warns about.

**The approach: measure it from data already being fetched.** Cross-correlate
the SWPA hourly schedule (or better, CWMS `Flow-Plant`, which is observed) against
hourly stage at each downstream gauge, and take the lag that maximises
correlation. This is a calibration job, not a hydrology model — it learns what
the river actually does rather than asserting a wave celerity.

Sketch, as a script under `scripts/` first and a table second:

1. For each dam with a downstream gauge, pull 30–90 days of hourly turbine flow
   and hourly downstream stage.
2. Difference both series (the *change* is what propagates; absolute levels
   carry seasonal drift that would dominate the correlation).
3. Cross-correlate over candidate lags of 0–24 hours at hourly resolution.
4. Record peak correlation, the lag at peak, and the **sharpness** of that peak.

**Step 4 is the part that decides whether this ships.** A broad, shallow peak
means the arrival is smeared out and no single number describes it — publish
nothing for that reach rather than a lag with false precision. A tall narrow
peak means the reach genuinely has a travel time. Set a correlation floor and a
peak-prominence floor up front, and let reaches fail them.

Expect lag to vary with discharge — a pulse moves faster on an already-high
river. Start with a single lag per reach and check the residual against
discharge before deciding whether a flow-dependent lag is worth the complexity.
If it is, the honest form is probably two lags (high release / low release), not
a fitted curve.

**Ground truth is free and already available:** Table Rock's turbine flow and
the tailwater stage below it were measured moving together this session. The
Black below Clearwater has a documented 40-river-mile offset and a 5% flow
agreement — a reach where the answer can be sanity-checked against something
already written down.

**Storage:** the calibrated lag is a slowly-changing property of a reach, not a
reading. It belongs beside the reach (a column, or the registry's `tailwater`
block) with the correlation and sample window recorded next to it, so a future
reader can see how much to trust it. Re-run the calibration on a schedule; do
not compute it per request.

## 2. Wade/drift windows — the payoff, and the liability

Only once (1) has a lag with a defensible correlation. Then:

> **Wadeable at Fall Creek 6:30 AM – 12:30 PM tomorrow**, from the dam's idle
> window shifted by the reach's measured lag.

Constraints, all of which fall out of what is already established:

- **Fail closed, exactly as `fetchDaySchedule` does.** No schedule for the day,
  or no lag that met the floor, means *no window* — never a default.
- **The disclaimer travels with it.** `WATER_REGIMES_STRATEGY.md` requires SWPA's
  "subject to change" everywhere the schedule appears, and this is the surface
  where it matters most, because it is the one that sounds like permission.
- **Absolute clock times, never countdowns.** Both dam surfaces are ISR'd at 300
  seconds and the iOS app caches longer; "in 2 hours" decays into a false claim
  while "at 6:30 AM" stays true. Already the rule for the next-change line.
- **Name the reach, not the river.** The lag is per-gauge; a window computed at
  one access does not hold at another twenty miles down.

The open question from the strategy doc stands and gets sharper here: a
generation schedule is safety-adjacent in a way a gauge reading is not, and a
*wade window* is the most safety-adjacent thing Eddy would have ever shipped.
Worth deciding the liability posture deliberately before this goes out, not
after.

## 3. Flagship tailwater reaches, under a regulated regime

Three, not ten — enough to prove the primitive without paying curation cost ten
times:

| Reach | Dam | Why this one |
|---|---|---|
| **Lake Taneycomo** | Table Rock | The single highest-demand tailwater in the footprint. Trout, cold year-round, and already the reason `/dams` exists as a standalone surface. |
| **White below Bull Shoals** | Bull Shoals | Largest plant in the registry (8 units, 380 MW nameplate), biggest swing, most generation hours. |
| **Little Red below Greers Ferry** | Greers Ferry | Independent district behaviour and a distinct fishery, so it tests the model rather than repeating it. |

**Do not force-fit the condition ladder.** `shared/condition-ladder.ts` assumes
one slowly-moving number describes the reach; a tailwater's state is
*generating / idle / ramping* and it changes at 3 PM. Add `regime` as a reach
attribute (strategy doc, step 3) and let a regulated reach render state +
schedule where a rain-fed reach renders a badge. The alert vocabulary in
`src/lib/alerts/event-kind.ts` needs its own kinds too — a regulated reach's
event is *"they start at 3 PM"*, which `classifyEventKind` cannot express.

Each reach still needs real curation: access points, the reach geometry, and the
gauge wiring. That is the actual cost here, and it is why the number is three.

## 4. Alerts — the counter-seasonal hook

Starred dams already exist (`/api/me/starred-dams`, migration 00206) and push
already exists. The obvious pairing has not been built: **notify when tomorrow's
schedule for a starred dam changes**, or when a wade window opens.

This is the retention argument from `EDDY_IOS_STRATEGY.md` in its most direct
form — trout tailwaters fish best in winter, which is precisely when float
demand collapses. It is also cheap, because the schedule is already fetched on a
cadence and the delivery path already exists.

Requires storing yesterday's fetched schedule to diff against, which the current
read-through design deliberately does not do. That is a real (small) change to
`src/lib/data/dams.ts`'s stated contract — worth making explicitly rather than
by accident.

---

## Sequence

| # | Step | Depends on | Notes |
|---|---|---|---|
| 1 | Lag calibration script + measurement writeup | — | Do this first; it decides whether 2 is possible at all. |
| 2 | Bucket the CDA fetch window so the cache hits | — | Independent, small, gets more valuable with every metric added. |
| 3 | `regime` on the reach + regulated rendering | — | Unblocks 4 and the alert kinds. |
| 4 | Taneycomo as the first regulated reach | 3 | One reach end to end before the other two. |
| 5 | Wade/drift windows | 1, 4 | Only if the lag met its floor. Liability call before ship. |
| 6 | Schedule-change alerts on starred dams | — | Independent of everything above; the cheapest retention win here. |

Step 1 is first because it is the only item that can come back and say *no*. If
the correlation is not there, steps 5 collapses and 4 is still worth doing on
its own — better to learn that from a script than from a shipped feature.
