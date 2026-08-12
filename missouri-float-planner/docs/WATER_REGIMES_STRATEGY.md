# Water Regimes — Dams, Tailwaters & Whitewater at Scale

**Status: active** — strategy, not a commitment. Written July 2026 alongside the first USACE dam integration.
**Companions:** `EDDY_IOS_STRATEGY.md`, `MULTI_STATE_SCALING_PLAN.md`, `RIVER_SCALING_PLAYBOOK.md`.
**Execution plan:** `TAILWATER_PLAN.md` carries steps 3–5 of the sequence below as concrete work, plus the August 2026 measurements that decided how they get built. This document stays the *why*; that one is the *what next*.

---

## The reframe

Eddy models **rivers**. To scale past the Ozarks it needs to model **what controls a river**.

Every curated reach belongs to one of four regimes, and the regime — not the state line — decides which forecast engine applies, what the UI leads with, and what an alert means.

| Regime | Controlled by | Right primitive | Known ahead | Eddy today |
|---|---|---|---|---|
| **Rain-fed** | precipitation | gauge + threshold ladder | ~2 days, probabilistic | ✅ the core product |
| **Spring-fed** | aquifer | gauge + ladder (stable) | effectively always | ✅ implicit (Current, Eleven Point) |
| **Regulated / tailwater** | an operator's schedule | **state machine + schedule** | **1–7 days, near-exact** | ← first integration underway |
| **Scheduled release** | a calendar | **a calendar** | **months** | ✗ |

The non-obvious part, and the strategic case for the whole direction:

> **Predictability increases as you go down that table.** More infrastructure does not mean more complexity — it means more certainty. A rain-fed Ozark river is a guess 48 hours out. Table Rock's Thursday generation is knowable today. A whitewater release weekend is knowable in January.

Eddy's product is planning. **The dammed water is the plannable water.** That is a better reason to build this than "fishermen want dam data."

---

## What the ladder assumes, and what breaks it

`shared/condition-ladder.ts` maps one number to one of seven codes. That model quietly assumes:

1. one number describes the reach
2. the number moves slowly (hours to days)
3. the gauge is representative of the reach
4. higher is monotonically worse

Each regime breaks different assumptions, which is why "just add a ladder" is the wrong instinct:

- **Tailwaters** break (1) and (2). The state is not *3,000 cfs*, it is *generating / idle / ramping, and it changes at 3 PM.* Level moves in minutes, not hours. **A ladder is the wrong primitive** — don't force-fit it. Show state plus schedule.
- **Whitewater** breaks (4) hardest. High water is often the point. The same reading is `dangerous` for a family canoe and `good` for a Class IV kayaker. It also breaks (3): whitewater runs are short and steep, frequently extrapolated from a gauge miles away on a different-sized watershed.
- **Scheduled releases** break (2) in the other direction — nothing happens for months, then everything happens on a Saturday.

### Resist ladder multiplication

The tempting fix for whitewater is ladders per (reach × craft × skill). That multiplies the exact thing `RIVER_SCALING_PLAYBOOK.md` already identifies as the bottleneck: curation.

Cheaper, and more honest: **keep one ladder per reach and state the craft it is for.** "Good for a canoe," not "Good." One word of copy defers a combinatorial curation problem indefinitely, and it is more truthful than the current unqualified verdict.

---

## Measured constraints

These were verified against live sources in July 2026. They are the facts that actually shape the architecture.

### CWMS does not generalize across districts

Same concept, six different names:

```
SWL   Flow-Res Out | 1Hour     | Regi-Comp
MVS   Flow-Out     | ~1Day     | lakerep-rev
SWT   Flow-Res Out | 1Hour     | Rev-Regi-Flowgroup
NAB   Flow-Out     | 15Minutes | National-CWMS-Forecast
SAM   Flow-Out     | 1Hour     | Raw-APCO / Raw-GPC
SPK   Flow-Res Out | 1Hour     | Calc-val
```

LRN and NWW publish nothing; MVR barely. **National dam coverage is ~40 district integrations, not one.**

**Therefore: stop hardcoding timeseries IDs.** The v1 registry enumerates them per dam, which is right for eight dams and wrong for eight hundred. Replace it with a **catalog-driven resolver** — ranked candidate patterns per logical metric, query `/catalog/TIMESERIES`, pick the freshest match, cache the resolution. Adding a district becomes adding patterns, not enumerating dams. It also self-heals the rename risk that the v1 plan can only detect and alert on.

This is the single highest-leverage refactor in this document, and it gets more expensive with every district added by hand.

Useful side finding: `SAM` carries `Raw-APCO` and `Raw-GPC` — Alabama Power and Georgia Power. **CWMS is already an aggregation point for some non-federal dams**, so the federal API reaches past federal projects.

### American Whitewater has no API and will not build one

AW maintains the national whitewater database (~6,000 reaches, class ratings, recommended flow ranges, gauge correlations) and states it does not intend to offer API access. It also ships its own iOS and Android apps and runs on a devoted volunteer community.

There is no clean import path, and scraping a beloved safety nonprofit is both a licensing problem and a bad look.

---

## Architecture

Eddy already has a registry for **where readings come from** (`src/lib/flow-providers/`, keyed on `gauge_stations.provider`). The scale answer is a second registry for **what drives the reach**.

### `ScheduleProvider` — mirroring `FlowProvider`

Same shape, different question. `FlowProvider` answers *what is the water doing?*; `ScheduleProvider` answers *what will an operator make it do?*

```ts
interface ScheduleProvider {
  readonly id: string;                       // 'swpa' | 'tva' | 'duke' | ...
  /** Hourly future state for a project, in canonical cfs. */
  fetchSchedule(projectId: string, days?: number): Promise<ScheduledFlow[]>;
  /** Calendar-shaped future releases, for scheduled-release reaches. */
  fetchReleaseCalendar?(projectId: string): Promise<ReleaseWindow[]>;
}
```

Implementations, in rough order of value: `SwpaProvider` (built — federal PMA, static HTML, 18 projects), then WAPA/SEPA (sibling PMAs, likely similar), `TvaProvider`, `DukeProvider`, FERC licensee calendars.

### `regime` as a first-class reach attribute

One column drives three behaviours:

- **which engine runs** — ladder vs. schedule vs. calendar
- **what the UI leads with** — a condition badge, a generation state, or a date
- **what an alert means** — rain-fed says *"it came up"*; tailwater says *"they start at 3 PM"*; scheduled says *"release weekend in 10 days"*

The alert vocabulary in `src/lib/alerts/event-kind.ts` is currently total over condition transitions only. Regulated and scheduled reaches need their own kinds, and they must not be forced through `classifyEventKind`.

### Dams as an entity class, not a feature

At national scale a dam is three things at once:

1. **A control** — it sets the level below it.
2. **A destination** — people fish the lake and the tailwater.
3. **A hazard** — low-head dams are the leading paddling killer, and `low_water_dam` already exists as a `HazardType` in `packages/eddy-types`.

The **National Inventory of Dams** (USACE, ~92k dams with coordinates and hazard classification) is the spine for (3). It exposes a JSON API surface — routes need discovery; my initial guesses returned structured 404s, so the server is there but the paths weren't.

**The hazard overlay may be worth more than the release schedules**, because it serves every user rather than only tailwater fishermen. It is also the clearest expression of Eddy's safety posture.

---

## The call on each

### Dams — yes, and they are the spine

Not a feature. An entity class, with a registry, a page type, and a hazard role. Everything else in this document hangs off getting dams modelled properly.

### Tailwaters — yes, and sooner than feels natural

The closest adjacency Eddy has: same geography, same states, overlapping audience, and an incumbent (the rebuilt USACE Little Rock app) sitting at **2.3★**. Taneycomo, White, Norfork, Little Red and Beaver form a coherent cluster reachable from the existing footprint.

The strategic bonus: **fishing is counter-seasonal to floating.** Trout tailwaters fish best in winter, which is precisely the November-MRR problem `EDDY_IOS_STRATEGY.md` spends a section worrying about. Tailwater coverage is the most natural answer to seasonal churn that Eddy has available.

### Whitewater — no, as a vertical

Different sport, different risk tolerance, and higher liability against an audit that already flags a floatability-liability concern. Missouri has essentially one whitewater run — the St. Francis at Millstream Gardens — which Eddy already carries. AW owns the space, has no API to import, and has no reason to yield. Chasing it dilutes a brand built on family float trips.

### Scheduled releases — yes, and nearly free

A different thing wearing the same name. A release calendar is the *same primitive* as a dam schedule, so it falls out of the `ScheduleProvider` work. It serves whitewater users **without Eddy ever rating a rapid or taking a position on Class IV safety.** That is the 80/20: the data, not the sport.

---

## Sequence

| # | Step | Why now |
|---|---|---|
| 1 | ~~Ship the two-source dam layer (CDA + SWPA)~~ **done** | Proved the split between reading and schedule. 20 projects across four districts. |
| 2 | ~~**Replace hardcoded timeseries IDs with the catalog resolver**~~ **done** | `src/lib/usace/resolve.ts`. Declared ids still win; the resolver fills gaps. |
| 3 | `regime` on the reach + the `ScheduleProvider` registry | Unlocks every regime below rain-fed. |
| 4 | Onboard the Ozark trout tailwaters as real reaches | Revenue-adjacent and counter-seasonal. |
| 5 | NID hazard overlay; release calendars | Opportunistic; the hazard half is a safety win for all users. |

Step 2 is the one to start earlier than instinct suggests. Everything else is additive; that one gets more expensive with every district added by hand.

---

## Open questions

- **Does the ladder stay single-axis forever?** The "state the craft" workaround is honest and cheap, but if vessel-specific verdicts ever become a paid feature, the multiplication problem returns properly.
- **What is the liability posture on a schedule?** A generation schedule is safety-adjacent in a way a gauge reading is not — it implies *when it is safe to stand in the river*. SWPA's own "subject to change" disclaimer must travel with the data everywhere it appears.
- **Do WAPA and SEPA publish like SWPA?** If the sibling power administrations share the format, federal hydro schedules are close to solved nationally. Unverified.
- **Is there a partnership path with American Whitewater** rather than a competitive one? They are a nonprofit with a data asset and no app-quality mandate; Eddy has the opposite. Worth a conversation before assuming the answer is no.
