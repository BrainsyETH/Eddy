# Verified Identifiers — Norfork Dam tailwater (North Fork River, AR) · swl-norfork-dam

Primary-source transcription from the CWMS Data API (office **SWL**) and USGS
NWIS, probed live **2026-08-24**. Companion to
`verified-identifiers-tailwater-swl-bull-shoals-dam.md`.

## The headline: the registry is wrong about this dam

`src/lib/flow-providers/usace-registry.ts` carries this comment on
`swl-norfork-dam`:

> Publishes no tailwater temperature, yet is a premier trout tailwater —
> the case that proves this must be declared rather than inferred.

**Norfork publishes tailwater temperature.** Probed 2026-08-24:

- `Norfork_Dam-Tailwater.Temp-Water_Ave.Inst.1Hour.0.CCP-Comp` → **53.5 °F**,
  30 hourly points, range 52–54 °F.
- `Norfork_Dam-Tailwater_Right_Bank.Temp-Water.Inst.1Hour.0.Decodes-rev` →
  **53.4 °F**, independent sensor, same window. The two corroborate.
- `Norfork_Dam-Tailwater_Left_Bank.Temp-Water.Inst.1Hour.0.Decodes-rev` exists.

What is true is narrower, and still worth the `tailwaterFishery` argument:
Norfork publishes no temperature **under the id `swlSeries()` builds**.
`Norfork_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev` — the standard
shape, `Temp-Water` on the bare `-Tailwater` sub-location with a `Decodes-rev`
version — returns **HTTP error**. Norfork files the same measurement as
`Temp-Water_Ave` under `CCP-Comp`, and per-bank under `Decodes-rev`.

So the fix is a per-dam series override, not flipping `tailwaterTemp` to true.
Flipping the boolean would resolve the id that does not exist.

## Extent, from the managing agency

**Norfork Dam → the White River confluence**, ~4.8 river miles. AGFC manages
the trout fishery over exactly this stretch, and the whole tailwater is
catch-and-release.

The geometry for it **already exists in production**: `north-fork-white`
(state MO, `spring_fed_float`, 106.6 mi) runs through Norfork Lake, passes
0.01 mi from the dam at mile 101.79, and ends at the confluence at mile 106.60
— a 4.81-mile tail. That river is clipped at the lake as part of this ingest so
the two rows do not overlap.

## CWMS locations (from /locations?office=SWL)

- `Norfork_Dam` — 36.24863 / -92.23786. ← registry lat/lon.
- `Norfork_Dam-Tailwater` — **36.24679567738 / -92.241057193146**.
  ← the `gauge_stations.location` for the release station.
- `Norfork_Dam-Siphon_Outlet` — 36.248630555556 / -92.237861111111.
- `Norfork_Dam-Tailwater_Left_Bank` / `_Right_Bank` — both 36.24863 / -92.23786.
- `Norfork_Dam-Siphon_Intake1..3` — all at the dam coordinates.

## Registry series (transcribed verbatim, all probed 2026-08-24)

### release ✅ `Norfork_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp`
- 30 points, **204 → 3,259 cfs**. Last 3,259 cfs.
### generationFlow ✅ `Norfork_Dam.Flow-Plant.Ave.1Hour.1Hour.CCP-Comp`
- 30 points, **20 → 3,074 cfs**. Last 3,074 cfs.
### poolElevation ✅ `Norfork_Dam-Headwater.Elev.Inst.1Hour.0.Decodes-rev` (ft)
- 554.6 ft.
### tailwaterElevation ✅ `Norfork_Dam-Tailwater.Elev-Downstream.Inst.1Hour.0.Decodes-rev` (ft)
- 374 → 376 ft over 30 hours.
### tailwaterTempF ❌ `Norfork_Dam-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev`
- **HTTP error — does not exist.** See the headline above for what does.

## The siphon, and why the arithmetic matters

`Norfork_Dam-Siphon_Outlet.Flow.Ave.1Hour.1Hour.CCP-Comp` reads a near-constant
**185 cfs** (range 184–185 over 30 hours).

Check the numbers against each other at the same timestamp:

```
release          3,259 cfs
generationFlow   3,074 cfs
siphon             185 cfs
                 -----------
3,074 + 185 =    3,259  ✓ exact
```

**Release = turbine + siphon.** That is a clean, verifiable decomposition of
this dam's outflow, and it means the siphon is the floor the tailwater never
drops below while it is running: the observed release minimum over the window
was 204 cfs, i.e. siphon plus a little leakage, with the units off.

The siphon is the Norfork minimum-flow mechanism. It is worth knowing that
this has not always been available: through at least October 2023 all Norfork
turbines were reported out of service for an extended period, with release
made through the siphon at 185 cfs plus flood gates. The turbines are running
now (3,074 cfs observed). **A future reader should not assume `generationFlow`
at this project is always live** — it has been zero for months at a stretch for
mechanical reasons, not scheduling ones.

## USGS sites below this dam (NWIS, probed 2026-08-24)

| Site | Name | Parameters | Latest |
| --- | --- | --- | --- |
| 07060000 | North Fork Riv US of Dry Ck bl Norfork Dam, AR | 00010, 00300 | 11.8 °C, **3.2 mg/L** |

As at Bull Shoals: **no USGS discharge or stage gauge in this tailwater.** The
one site below the dam is a water-quality monitor. The release station is the
primary gauge.

That 3.2 mg/L dissolved-oxygen reading is low enough to be a genuine angling
signal — hypolimnetic release from a stratified lake in late summer is oxygen-
poor, which is the problem the siphon and the minimum-flow programme exist to
address. Nothing in Eddy currently carries DO.

## Condition rating — NOT FOUND (2026-08-24)

Same search and same outcome as Bull Shoals; see that dossier for the full
list of sources checked. AGFC's Norfork Tailwater page gives the boundary and
the catch-and-release regulation and no numeric flow guidance.

**Consequence:** `norfork-tailwater` lands `active = false`, all `level_*`
NULL, `condition_rating_source` NULL.

## Facts

- Nameplate **2 × 80 MW combined**. Unchanged.
- `tailwaterFishery: 'trout'` — 53.5 °F in August, now measured rather than
  asserted.
- `generationOnCfs: 100` holds, but read the siphon note: the idle floor here
  is ~185–204 cfs, so the 100 cfs threshold sits *below* the siphon release and
  correctly reads "not generating" for a river that is nonetheless flowing.
