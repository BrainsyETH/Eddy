# Adding USACE dams — what it costs, and what it buys

Scoping notes for expanding `src/lib/flow-providers/usace-registry.ts` beyond the
current 20 projects. Written 2026-08-15, after the generation-console work.

Read this before adding a dam. The mechanical part is small; the two things that
are *not* mechanical are getting `cdaLocation` right and understanding that a dam
outside SWPA's schedule file gets a materially thinner page than the ones already
shipped.

## The headline

**SWPA is exhausted.** All 18 projects in the schedule file are wired, and
`UNWIRED_SWPA_PROJECTS` is empty with a test enforcing that every SWPA code is
either claimed or explicitly named as skipped. So **no dam added from here brings
a generation schedule** — which is what the dam console was built for.

**Kansas City is a dead end.** NWK publishes zero timeseries to CDA (verified;
`nwk-wc.usace.army.mil` is unreachable too). That rules out the remaining
Missouri Corps reservoirs. Pomme de Terre is already documented in
`KNOWN_UNPUBLISHED` as absent from both sources, deliberately, so its absence
reads as a finding rather than an oversight.

Everything below is therefore a **CWMS-only** addition.

## What a new dam actually requires

Enforced by `usace-registry.test.ts`, which is where to look first:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | must equal the registry key |
| `name`, `lakeName`, `state` | yes | `state` is a union — `'MO' \| 'AR' \| 'OK' \| 'TX'`. A Kansas Tulsa lake needs the union widened. |
| `lat`, `lon` | yes | **from CWMS `/locations`, not a gazetteer** |
| `office` + `cdaLocation` | yes (or `swpaCode`) | a dam must publish to CWMS, SWPA, or both — never neither |
| `tailwaterFishery` | **yes, always** | cannot be inferred; Norfork is a trout tailwater publishing no water temperature |
| `generationOnCfs` | only with `swpaCode` | must clear observed idle leakage and stay under 5% of full power |
| `nameplate` | only with a powerhouse | never SWPA's scheduling capacity — see the Bull Shoals note |
| `series` | no | SWL/SWT/MVS resolve live from the catalog |

**No database migration is needed** unless the dam declares a `tailwater`. The
`gauge_stations` row in `00198_usace_tailwater_stations.sql` exists so a
release rides the normal river-gauge ingestion pipeline; a dam with no tailwater
needs none. Reservoir state is read per-request in the dam routes and is
deliberately kept out of `gauge_readings` — a 916 ft pool elevation in
`gauge_height_ft` would trip the flood-stage override and paint a river red.

**No UI work.** `USACE_DAMS` drives the index, the detail page, the map layer and
the iOS screen.

If the dam is a trout tailwater, `usace-registry.test.ts` holds an **exact list**
of the seven trout projects and will fail until it is updated. That is by design:
"adding a dam should force a decision about its fishery, not inherit one."

## The blocker: `cdaLocation` cannot be derived

There is no rule. Within a single district:

```
Table_Rock_Dam       SWL reservoir   name with underscores
GreersFerry_Dam      SWL reservoir   and sometimes without the space
LD12_Ozark           SWL lock & dam  lock number, then name
Mark Twain Lk-Salt   MVS             spaces, abbreviation, stream suffix
TENK / FGIB / BROK   SWT             opaque four-letter codes
```

Nothing about "DeGray Lake" says whether SWL files it as `DeGray_Dam`, `DEGR` or
`DeGray Lk-Caddo`. A wrong value is a **silent 404, not a type error**.

`scripts/discover-usace-locations.ts` exists to answer this: it lists every
location a district publishes, diffs against the registry, and prints candidates
with the coordinates and state CWMS itself reports. It also flags any *registered*
location that has disappeared upstream, which would break a shipped dam.

It needs network access to `cwms-data.usace.army.mil`. **That host is reachable
from the Claude Code web environment** — verified 2026-08-24, when every series
in the three White River system tailwater dossiers was probed live from one.
This paragraph previously said the default policy blocked it; that is no longer
true and may never have been true for this host specifically. What genuinely is
unreachable from there is the district *water-control* subdomain
(`swl-wc.usace.army.mil`, which hosts the White River FAQ) — DNS times out and
then TLS fails, the same failure this doc records for `nwk-wc`.

One trap worth carrying over from that probing: the catalog's `like` parameter
is a **regex over the full timeseries id and needs a trailing `.*`**.
`like=Bull_Shoals_Dam` returns `total: 0`; `like=Bull_Shoals_Dam.*` returns 220
entries. `fetchCatalog()` appends it correctly, but a hand-probe that forgets
will conclude a live project publishes nothing.

## What each candidate would actually deliver

### Little Rock — hydro, but not in SWPA's schedule file

DeGray (Caddo), Narrows/Lake Greeson (Little Missouri), Blakely Mountain/Lake
Ouachita (Ouachita). All three have coldwater tailwaters.

These used to expose a real gap. `hasTurbines` was `Boolean(dam.swpaCode)`, so a
hydro project SWPA does not schedule rendered as **having no powerhouse at all**
even though CWMS publishes `Flow-Plant` for it, and the history cron filtered the
same way — no pattern history either.

**That is fixed.** `hasPowerhouse(dam)` in the registry is now the single rule,
used by both the wire field and the cron:

```ts
export function hasPowerhouse(dam: UsaceDam): boolean {
  return Boolean(dam.swpaCode || dam.nameplate);
}
```

Two ideas that were one field are now separate: `hasPowerhouse` follows the
**plant**, `swpaCode` gates only the **schedule** and the `generationReference`.

It is `nameplate` rather than "has a turbine" because of Wappapello, which has
175 kW of station service and must stay false — it never peaks, and a hero
reading "generating" for it answers a question nobody asked. And it cannot be
`Boolean(nameplate)` alone because the ten Tulsa and lock-and-dam projects carry
a code with no nameplate. Both cases are pinned by tests.

So a DeGray-shaped entry now needs a `nameplate` and a `generationOnCfs` floor,
and it gets: observed turbine flow, the generation hero, and pattern history.
It does **not** get a schedule, a next-change line, or the forward half of the
pattern strip — those need SWPA. The console already degrades correctly without
a `generationReference`: the percentage, the rack and the equivalents phrase all
return null rather than zero, and pattern cells carry `generating` independently
of scale.

**Estimate:** ~1 hour per dam, once the location id is known.

### Little Rock — flood control only

Nimrod (Fourche LaFave), Blue Mountain (Petit Jean), Millwood, DeQueen, Dierks,
Gillham.

These are the Clearwater shape: pool elevation, % flood pool, release, inflow,
tailwater elevation. No powerhouse, no schedule, no pattern strip.

**Estimate:** ~1 hour each once the ids are known. But see below — without a
tailwater in Eddy, each is a lake dashboard with no river attached.

### Tulsa — the remaining lakes

Oologah, Skiatook, Kaw, Wister, Sardis, Hugo, Pine Creek and roughly ten others.
Cheapest of all: SWT dams carry no `series` and resolve everything live, so an
entry is `office`, `cdaLocation`, coordinates and a fishery.

**Estimate:** ~30 minutes each. None is an Ozarks float destination.

## The thing worth deciding first — acted on 2026-08-24

This section used to read: every river Eddy carries near a dam sits **above**
the lake, so **1 of 20 dams declares a `tailwater`** and all seven trout
tailwaters declare none. Adding dams increased that ratio without improving it,
and the real constraint was river coverage below the dams, not dam count.

**Three tailwaters were ingested in answer to it**, so the count is now **4 of
20**, and three of the trout projects declare one:

| Dam | River | Extent |
| --- | --- | --- |
| Bull Shoals | `white` | dam → AR Hwy 58 at Guion, 90.5 mi |
| Norfork | `norfork-tailwater` | dam → White confluence, 4.9 mi |
| Table Rock | `taneycomo` | dam → Powersite Dam, 23.1 mi |

`north-fork-white` was clipped at the Highway PP bridge as part of that work —
its geometry used to run through Norfork Lake and past the dam to the
confluence, so the last five miles of it *were* the Norfork tailwater.

Two things the ingest established that change the estimates above:

- **None of these three carries a `sectionSlug`.** Each tailwater is its own
  river, which `dam-types.ts` always allowed ("a tailwater that is its own river
  needs no reach"). Clearwater → Black remains the only case where a dam
  controls a *reach* of a river Eddy carries above it, which is still why
  `sectionSlug` exists.
- **A tailwater has no USGS flow gauge.** All six USGS sites below these three
  dams publish water temperature and dissolved oxygen and nothing else, so the
  dam's own release is the river's primary gauge — not a supplementary one as
  at Clearwater. Budget for that when scoping the next one.

They are all **inactive**, because no agency publishes a rating mapping release
to wade or float safety, and `validate_river_data()` will not let an active
river's primary gauge have no ladder. Coverage below the dams is no longer the
constraint. **A citable condition rating is.**
