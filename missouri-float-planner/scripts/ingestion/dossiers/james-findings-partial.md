# James River — distilled research (draft, pre-signoff)
Full sourced JSON is in the agent task output file (backstop). This is the assembly-ready extract.

## Identity
- MO, Ozarks (Springfield Plateau). spring_fed_float (lower) / urban-runoff (upper). Class I.
- ~99 mi (MDC). GNIS 750497. NHD reachcode 11010002000005, NHDPlus COMID 7609749. NHD Permanent_Identifier GUID = UNKNOWN (toVerify).

## Gauges (USGS-verified)
- **07052500 James at Galena** — PRIMARY (lower/Galena reach). 36.80539,-93.46158 NAD83, Stone Co, HUC 11010002, drainage 987 sqmi, params 00060(cfs)+00065(ft), NWS LID **GLNM7** (action 11ft/flood 15ft — CROSS-CHECK ONLY).
- **07052250 James near Boaz** — middle/upper floatable. 37.00658,-93.36467, drainage 462, 00060+00065, LID JAMM7 (medium conf).
- **07050700 James near Springfield** — upper/urban. 37.14997,-93.20339, drainage UNKNOWN(toVerify), 00060+00065, LID UNKNOWN(toVerify).

## Thresholds
### Lower/Galena reach — rep gauge 07052500
- optimal_min = **180 cfs** (moherp OBSERVED "Good"), medium
- optimal_max ≈ 937 cfs (INFERRED from trip reports; Good seen to 937, High by 2330), low
- high = **7 ft** gage height (James River Outfitters caution 7–8 ft), medium
- **dangerous = 8 ft** gage height (outfitter "no boats >8 ft, no exceptions") — FLOATER DO-NOT-FLOAT, medium-high. Deliberately NOT the NWS flood stage (15 ft).
- too_low/low = UNKNOWN (no OBSERVED breakpoint; ESTIMATED rejected)
- ⚠ UNIT MIX: optimal band in cfs, high/dangerous in ft. Dossier needs ONE unit per gauge. SIGN-OFF DECISION: badge Galena on ft (matches outfitter do-not-float) or cfs (matches moherp)? Recommend ft (the safety anchor is in ft) and re-derive optimal band in ft, or keep cfs and get an outfitter cfs ceiling. Needs owner call.
### Upper/urban reach — 07050700 / 07052250
- NO calibrated OBSERVED thresholds; danger = UNKNOWN (no floater source). Only scattered trip reports. → badge conservatively / insufficient-data, or defer this reach.

## Access points (coords verified only)
- Shelvin Rock 36.9962,-93.3699 (MDC); Hootentown 36.9383,-93.3858 (MDC, SMA upstream end); Y-Bridge Galena 36.8069,-93.4618 (take-out, at the gauge).
- Kissick Dam ~mi 12.3 — low-head dam HAZARD (portage/scout).
- Many others (Delaware Town, HL Kerr, etc.) coords UNKNOWN (toVerify). Full run Hootentown→Galena = 22 mi.

## Services
- **James River Outfitters** (Galena) — outfitter+campground. (417)357-6443, reservations@jamesriveroutfitters.com, FareHarbor. canoe/kayak/raft/SUP/tube/shuttle/camping/RV/store. Publishes the 8 ft do-not-float badge off 07052500. Reach: lower/Galena.
- **Float the James / Horsecreek Ranch** (Galena) — outfitter+cabin+campground. (417)655-8007, floatthejames.com. tube/kayak/SUP/shuttle/camping/cabins. Reach: lower/Galena.

## Key gaps / sign-off items
- Upper-reach danger anchor UNKNOWN (no floater source) — by design.
- Galena unit decision (ft vs cfs) — owner call.
- NHD Permanent_Identifier GUID; Springfield drainage+LID; most access coords.
- Cabins conflict at James River Outfitters.
