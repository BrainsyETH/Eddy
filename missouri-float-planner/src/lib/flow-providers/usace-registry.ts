// src/lib/flow-providers/usace-registry.ts
// Per-dam map from a LOGICAL metric to a CONCRETE CWMS timeseries id, plus the
// SWPA project code where the dam has turbines.
//
// There is no derivable rule here, which is the whole reason this file exists.
// The Little Rock district writes
//   Table_Rock_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp
// while St. Louis writes
//   Wappapello Lk-St Francis.Flow-Out.Ave.~1Day.1Day.lakerep-rev
// for the same idea — different underscore/space convention, different
// interval, different version suffix. Every id below was confirmed live
// against the API on 2026-07-27.
//
// Metrics are OPTIONAL BY DESIGN. Clearwater has no turbines, so no
// generationFlow and no tailwater temperature; MVS publishes no % flood pool;
// Stockton and Truman publish NOTHING to CWMS at all and exist here only as
// SWPA schedule entries. Code must read an absent metric as "this dam does not
// have one" — never as an outage, and never render it as 0 or an em-dash.
//
// SCALING: enumerating ids by hand is right for ten dams and wrong for a
// hundred, so src/lib/usace/resolve.ts discovers them from the CWMS catalog
// instead. A dam needs only `office` + `cdaLocation` to work — the eight Tulsa
// projects below carry no series at all and resolve their metrics live.
//
// That claim was FALSE for a stretch and the failure is worth remembering. On
// 2026-08-02 the resolver returned monthly averages instead of hourly readings
// for every dam it was asked about, because CWMS had frozen its catalog's
// timestamps six days back and the resolver gated freshness on them. It was
// invisible precisely because the ids below always win, so no shipped dam ever
// exercised the broken path. If you add a dam that relies on resolution, run
// `npx tsx scripts/check-usace-resolver.ts` and believe the output over this
// comment.
//
// The explicit ids below are kept and still WIN, because they were confirmed
// against the API and a resolver that silently picks the wrong series is worse
// than a hardcoded one that 404s loudly. The resolver fills gaps; it does not
// override. Recovering automatically from a RENAMED series (rather than just a
// missing one) is the remaining half of that idea and is not built yet.

// Grows one district at a time, deliberately: `office` goes straight into a CDA
// query parameter, so a typo is a silent 404 rather than a type error, and this
// union is the only thing that catches it.
import type { DamTailwater } from '@shared/dam-types';

export type UsaceOffice = 'SWL' | 'MVS' | 'SWT' | 'LRN';

// Mirrors shared/dam-types.ts UsaceMetric — the wire side documents why the
// two forecast members must never enter SNAPSHOT_METRICS or DETAIL_METRICS.
export type UsaceMetric =
  | 'release'
  | 'releaseForecast'
  | 'poolElevation'
  | 'pctFloodPool'
  | 'inflow'
  | 'generationFlow'
  | 'generationForecast'
  | 'tailwaterElevation'
  | 'tailwaterTempF';

export interface UsaceSeries {
  /** Raw CWMS timeseries id. Encoded at request time — contains spaces and %. */
  tsId: string;
  /** Unit REQUESTED from CDA; the API converts server-side. */
  unit: 'cfs' | 'ft' | 'F' | '%';
  /** True when values in the future are expected and must not read as observed. */
  forecast?: boolean;
  /**
   * How far back to look for "the latest value", in hours. Defaults to 8,
   * which suits an hourly series plus publication lag.
   *
   * MVS overrides this: its observed release is a DAILY average published
   * about a day in arrears, so an 8-hour window finds nothing at all. Caught
   * by a live smoke test where Wappapello and Mark Twain returned no reading
   * while all six SWL dams did.
   */
  lookbackHours?: number;
  /**
   * True when the value is a daily mean rather than a spot reading. The UI
   * must label it as such — presenting a day-old average as "releasing now"
   * would be a correctness bug, not a cosmetic one.
   */
  dailyMean?: boolean;
}

export interface UsaceDam {
  /** Eddy-side slug. Also gauge_stations.site_id_external and the URL segment. */
  id: string;
  name: string;
  lakeName: string | null;
  /**
   * Kept a union rather than `string` for the same reason as UsaceOffice: it is
   * a display key that groups the index, and a typo would silently create a
   * one-dam group nobody notices. `DamSnapshot.state` on the wire is already
   * `string`, so widening this costs nothing downstream.
   */
  state: 'MO' | 'AR' | 'OK' | 'TX' | 'KY' | 'TN';
  lat: number;
  lon: number;
  /** CWMS office, when this dam publishes to CDA at all. */
  office?: UsaceOffice;
  /** CWMS /locations name. Carries spaces on MVS. */
  cdaLocation?: string;
  /**
   * ALL the CWMS locations this project's series hang off, for districts
   * where one prefix cannot span them. LRN keys observed series on two
   * NWS-handbook stations per project (tailwater and pool) and its forecast
   * on a prose name — three namespaces. The resolver searches every listed
   * location; the SPECS pairs still decide which series carries a metric.
   * Mutually exclusive with `cdaLocation` by convention: set one or the
   * other, and the single-location field remains the common case.
   */
  cdaLocations?: string[];
  /** SWPA column code, when the dam has turbines on the federal grid. */
  swpaCode?: string;
  /**
   * Which Ameren Missouri feed backs this dam's metrics, for the dams CWMS
   * cannot serve — see src/lib/ameren/osage.ts for the API and its story.
   *
   * 'osage'  — Bagnell itself: hourly pool, tailwater and discharge.
   * 'truman' — the daily report's levelandFlowData block, which carries the
   *            observed pool and outflow of Truman upstream. Kansas City
   *            publishes nothing to CWMS, so this is the only observed
   *            Truman data anywhere; it arrives about a day in arrears and
   *            its readings wear their own timestamps.
   *
   * A dam with this set reads metrics from Ameren INSTEAD of CWMS — the two
   * paths never mix on one dam, so a reading's provenance is never a blend.
   */
  amerenMetrics?: 'osage' | 'truman';
  /**
   * Turbine flow above which the powerhouse counts as running. Table Rock
   * idles around 20 cfs with the units off, so a bare `> 0` test would read
   * "generating" all day.
   */
  generationOnCfs?: number;
  /**
   * TRUE only when this project's `release` and `generationFlow` have been
   * verified to measure separately meaningful things, so their difference is a
   * real non-power release.
   *
   * ── Why this is declared and never inferred ────────────────────────────────
   * The two series are resolved per district from different CWMS parameter
   * families, and nothing in the numbers reveals whether they are independent.
   * Bull Shoals returned byte-identical values for both on a live read (5,075
   * cfs each) — which is either a genuine all-through-the-turbines hour or two
   * names for one series, and no timestamp or tolerance check can tell those
   * apart. Subtracting them anyway is how "the turbines are idle and the gates
   * are open" gets printed under a dam where neither is true.
   *
   * Same discipline as `tailwaterFishery`: declared from a source, because
   * inferring it gets the interesting cases exactly backwards. Absent means the
   * pair renders as two separate facts, which is always safe.
   *
   * Nothing sets this yet. It is deliberately unset on every dam until somebody
   * verifies a specific project's two series against the district's own
   * definitions and records that here with a date.
   */
  releaseExcludesGeneration?: boolean;
  /**
   * The reach below this dam, when Eddy carries it.
   *
   * Only a TAILWATER goes here — a river whose level IS the release. A river
   * that merely feeds the pool (the Black at Annapolis, the St. Francis above
   * Wappapello, the James into Table Rock) is deliberately absent: a dam
   * matters to a floater because of the water below it, and a pool elevation
   * is not why anyone opens this feature.
   *
   * Most dams have none, and that is fine — the dam page stands on its own.
   * Today exactly one tailwater is in Eddy: Clearwater -> the Black at Poplar
   * Bluff, measured 5% apart on 2026-07-27 (3,561 released vs 3,380 gauged,
   * ~40 river miles down).
   */
  /**
   * `sectionSlug` names the river_sections reach the release actually lands in
   * (migrations 00204/00205), so a dam can point at the tailwater rather than at
   * the whole river — on the Black, the river page opens on the spring-fed
   * Lesterville float, which is not the water this dam controls. Optional: a
   * tailwater that is its own river needs no reach.
   */
  // The shared type, not a second inline copy of it. The copy that used to be
  // here had drifted: shared/dam-types.ts grew waterQualitySiteId and this did
  // not, so the registry could not declare the field the wire already carried.
  tailwater?: DamTailwater;
  /**
   * NAMEPLATE generating capacity — deliberately not SWPA's number.
   *
   * SWPA's project table lists short-term overload/scheduling capability,
   * which runs higher: Table Rock is 4x50 MW nameplate but SWPA schedules
   * against 230; Beaver is 112 vs 128; Truman 160 vs 184. Both are correct for
   * their own purpose, so describe the plant with THIS and convert megawatts
   * to cfs with SWPA's pair (see megawattsToCfs) — the conversion needs both
   * halves to come from the same table to stay internally consistent.
   */
  nameplate?: { units: number; megawatts: number };
  /**
   * What lives in the water below the dam.
   *
   * A deep-draw ("hypolimnetic") release runs cold year-round and makes a
   * trout tailwater; a surface or gate release does not. This is a property of
   * the project, NOT something to infer from today's temperature reading —
   * Norfork is a premier trout tailwater that publishes no water temperature
   * at all, so inferring it would silently drop the label on exactly the
   * fishery most worth naming.
   */
  tailwaterFishery?: 'trout' | 'warmwater';
  /** Recorded line giving current releases — the fallback when a feed is down. */
  infoPhone?: string;
  /**
   * Metrics this project publishes but which do not MEAN here what they mean
   * elsewhere, so they must not be rendered.
   *
   * The case this exists for: `%-Flood Pool Full` on a run-of-river navigation
   * dam. Robert S. Kerr and Webbers Falls hold a constant navigation pool, and
   * both read ~91% of flood pool as their ordinary summer state (measured
   * 2026-08-02) — a true number that tells a reader the opposite of the truth
   * beside Table Rock's 0%. Those two publish `%-Navigation Pool Full` for the
   * quantity that actually describes them, which Eddy has no concept for yet.
   *
   * Suppression is deliberately per-dam and explicit rather than inferred from
   * the value, because the number is not wrong — its meaning is local.
   */
  suppressMetrics?: UsaceMetric[];
  series: Partial<Record<UsaceMetric, UsaceSeries>>;
}

/**
 * The six Little Rock dams share one naming template — only the location name
 * changes — so they're generated rather than repeated. St. Louis does not
 * share it and is written out literally below.
 */
function swlSeries(dam: string, opts: { turbines: boolean; tailwaterTemp: boolean }) {
  const series: Partial<Record<UsaceMetric, UsaceSeries>> = {
    release: { tsId: `${dam}.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp`, unit: 'cfs' },
    releaseForecast: {
      tsId: `${dam}.Flow-Res Out.Ave.~1Day.1Day.Forecast`,
      unit: 'cfs',
      forecast: true,
    },
    poolElevation: { tsId: `${dam}-Headwater.Elev.Inst.1Hour.0.Decodes-rev`, unit: 'ft' },
    pctFloodPool: { tsId: `${dam}-Headwater.%-Flood Pool.Inst.1Hour.0.CCP-Comp`, unit: '%' },
    inflow: { tsId: `${dam}.Flow-Res In.Ave.1Hour.1Hour.6hr-RunAve-A2W`, unit: 'cfs' },
    tailwaterElevation: {
      tsId: `${dam}-Tailwater.Elev-Downstream.Inst.1Hour.0.Decodes-rev`,
      unit: 'ft',
    },
  };
  if (opts.turbines) {
    series.generationFlow = { tsId: `${dam}.Flow-Plant.Ave.1Hour.1Hour.CCP-Comp`, unit: 'cfs' };
  }
  if (opts.tailwaterTemp) {
    series.tailwaterTempF = {
      tsId: `${dam}-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev`,
      unit: 'F',
    };
  }
  return series;
}

export const USACE_DAMS: Record<string, UsaceDam> = {
  'swl-clearwater-dam': {
    id: 'swl-clearwater-dam',
    name: 'Clearwater Dam',
    lakeName: 'Clearwater Lake',
    state: 'MO',
    lat: 37.1349222,
    lon: -90.7708833,
    office: 'SWL',
    cdaLocation: 'Clearwater_Dam',
    // No hydropower at all — pure flood control. Its tailwater is walleye,
    // paddlefish and bass water, not trout.
    tailwaterFishery: 'warmwater' as const,
    infoPhone: '573-223-7777',
    // The one tailwater Eddy currently carries. Poplar Bluff (07063000) sits
    // BELOW the dam and is release-driven; Annapolis (07061500) sits above the
    // lake and is not, so it gets no dam treatment.
    tailwater: { riverSlug: 'black', gaugeSiteId: '07063000', sectionSlug: 'lower-markham-hammer' },
    // Flood control only — no powerhouse, hence no SWPA code, no generation
    // flow and no tailwater temperature. Its release is steady, which is why a
    // daily forecast figure is honest here in a way it isn't for a hydro dam.
    series: swlSeries('Clearwater_Dam', { turbines: false, tailwaterTemp: false }),
  },
  'swl-table-rock-dam': {
    id: 'swl-table-rock-dam',
    name: 'Table Rock Dam',
    lakeName: 'Table Rock Lake',
    state: 'MO',
    lat: 36.59539,
    lon: -93.31106,
    office: 'SWL',
    cdaLocation: 'Table_Rock_Dam',
    swpaCode: 'TRD',
    nameplate: { units: 4, megawatts: 200 },
    // Lake Taneycomo — cold hypolimnetic release, ~48F year-round.
    tailwaterFishery: 'trout' as const,
    infoPhone: '866-494-1993',
    generationOnCfs: 100,
    // Lake Taneycomo is its own river row, so no sectionSlug. It is bounded
    // below by Powersite Dam, which is Liberty Utilities' and not in this
    // registry — Powersite ends this water, Table Rock drives it.
    // 07053450 sits immediately below the dam. Its 5.1 mg/L against 9.2 at
    // School of the Ozarks ten miles down is the clearest re-aeration
    // gradient in the footprint.
    tailwater: {
      riverSlug: 'taneycomo',
      gaugeSiteId: 'swl-table-rock-dam',
      waterQualitySiteId: '07053450',
      waterQualitySiteName: 'White River bl Table Rock Dam near Branson, MO',
    },
    series: swlSeries('Table_Rock_Dam', { turbines: true, tailwaterTemp: true }),
  },
  'swl-bull-shoals-dam': {
    id: 'swl-bull-shoals-dam',
    name: 'Bull Shoals Dam',
    lakeName: 'Bull Shoals Lake',
    state: 'AR',
    lat: 36.3657191,
    lon: -92.574845,
    office: 'SWL',
    cdaLocation: 'Bull_Shoals_Dam',
    swpaCode: 'BSD',
    // 340, not 380. The Corps' own Major Equipment Replacement fact sheet
    // (Little Rock District, as of 02/27/2026) reads: "Bull Shoals Dam
    // Powerplant is an 8-unit hydroelectric plant with a combined installed
    // power capacity of 340 MW. This project will increase the power capacity
    // to 362 MW." SWPA schedules the same plant against 391. The 380 that stood
    // here matched none of the three, and this line is now rendered beside a
    // generator rack built from the SWPA pair — a wrong nameplate next to a
    // right one reads as a contradiction in Eddy rather than in the sources.
    // Verified 2026-08-12; see
    // scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-bull-shoals-dam.md.
    nameplate: { units: 8, megawatts: 340 },
    tailwaterFishery: 'trout' as const,
    infoPhone: '870-431-5311',
    generationOnCfs: 100,
    // No sectionSlug: the White below this dam is its own river, not a reach of
    // one. gaugeSiteId is this dam's own release, because USGS publishes no
    // discharge or stage anywhere in the tailwater — the three sites below the
    // dam are water-quality monitors.
    // 07054501 is the water-quality monitor AT the dam (temp + dissolved
    // oxygen, no flow). 5.2 mg/L on 2026-08-24, against 7.3 at Fairview a few
    // miles down — the release re-aerates as it runs.
    tailwater: {
      riverSlug: 'white',
      gaugeSiteId: 'swl-bull-shoals-dam',
      waterQualitySiteId: '07054501',
      waterQualitySiteName: 'White River at Bull Shoals Dam near Flippin',
    },
    series: swlSeries('Bull_Shoals_Dam', { turbines: true, tailwaterTemp: true }),
  },
  'swl-beaver-dam': {
    id: 'swl-beaver-dam',
    name: 'Beaver Dam',
    lakeName: 'Beaver Lake',
    state: 'AR',
    lat: 36.421283333333,
    lon: -93.847616666667,
    office: 'SWL',
    cdaLocation: 'Beaver_Dam',
    swpaCode: 'BEV',
    nameplate: { units: 2, megawatts: 112 },
    tailwaterFishery: 'trout' as const,
    infoPhone: '866-494-1993',
    generationOnCfs: 100,
    series: swlSeries('Beaver_Dam', { turbines: true, tailwaterTemp: true }),
  },
  'swl-norfork-dam': {
    id: 'swl-norfork-dam',
    name: 'Norfork Dam',
    lakeName: 'Norfork Lake',
    state: 'AR',
    lat: 36.24863,
    lon: -92.23786,
    office: 'SWL',
    cdaLocation: 'Norfork_Dam',
    swpaCode: 'NFD',
    nameplate: { units: 2, megawatts: 80 },
    tailwaterFishery: 'trout' as const,
    infoPhone: '870-431-5311',
    generationOnCfs: 100,
    // 07060000 is the only USGS site in this tailwater and it measures no
    // flow at all — temperature and dissolved oxygen only. 3.2 mg/L on
    // 2026-08-24, low enough to matter to the fish this water exists for.
    tailwater: {
      riverSlug: 'norfork-tailwater',
      gaugeSiteId: 'swl-norfork-dam',
      waterQualitySiteId: '07060000',
      waterQualitySiteName: 'North Fork Riv US of Dry Ck bl Norfork Dam, AR',
    },
    // Norfork DOES publish tailwater temperature — it just does not publish it
    // under the id swlSeries() builds. The standard shape
    // (`-Tailwater.Temp-Water.Inst.1Hour.0.Decodes-rev`) returns an HTTP error
    // here; Norfork files the same measurement as `Temp-Water_Ave` under
    // `CCP-Comp`, corroborated by per-bank `Decodes-rev` sensors that agreed to
    // a tenth of a degree when probed. 53.5 F on 2026-08-24, in August.
    //
    // This entry read "publishes no tailwater temperature at all" until then,
    // and offered that as the proof that fishery must be declared rather than
    // inferred. The argument is sound and the example was wrong; the two Tulsa
    // trout projects carry it now, since SWT publishes no water temperature at
    // any project. See
    // scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-norfork-dam.md.
    series: {
      ...swlSeries('Norfork_Dam', { turbines: true, tailwaterTemp: false }),
      tailwaterTempF: {
        tsId: 'Norfork_Dam-Tailwater.Temp-Water_Ave.Inst.1Hour.0.CCP-Comp',
        unit: 'F',
      },
    },
  },
  'swl-greers-ferry-dam': {
    id: 'swl-greers-ferry-dam',
    name: 'Greers Ferry Dam',
    lakeName: 'Greers Ferry Lake',
    state: 'AR',
    lat: 35.52103,
    lon: -91.99362,
    office: 'SWL',
    cdaLocation: 'GreersFerry_Dam',
    swpaCode: 'GFD',
    nameplate: { units: 2, megawatts: 110 },
    tailwaterFishery: 'trout' as const,
    infoPhone: '501-362-5150',
    generationOnCfs: 100,
    series: swlSeries('GreersFerry_Dam', { turbines: true, tailwaterTemp: true }),
  },

  // St. Louis district inverts the usual freshness assumption: observed release
  // is a DAILY average roughly a day behind, while the forecast is HOURLY and
  // runs ~11 days out. Presenting that daily mean as "releasing now" would be a
  // correctness bug, so callers must label it as a daily figure.
  'mvs-wappapello': {
    id: 'mvs-wappapello',
    name: 'Wappapello Lake',
    lakeName: 'Wappapello Lake',
    state: 'MO',
    lat: 36.9331,
    lon: -90.2837,
    office: 'MVS',
    cdaLocation: 'Wappapello Lk-St Francis',
    // A 175 kW station-service turbine only — it powers the dam, it does not
    // peak, so there is no generation schedule and no SWPA column.
    tailwaterFishery: 'warmwater' as const,
    series: {
      release: {
        tsId: 'Wappapello Lk-St Francis.Flow-Out.Ave.~1Day.1Day.lakerep-rev',
        unit: 'cfs',
        lookbackHours: 72,
        dailyMean: true,
      },
      releaseForecast: {
        tsId: 'Wappapello Lk-St Francis.Flow-Out.Inst.1Hour.0.CWMS-Forecast-NoQPF',
        unit: 'cfs',
        forecast: true,
      },
      poolElevation: {
        tsId: 'Wappapello Lk-St Francis.Elev.Inst.30Minutes.0.lrgsShef-rev',
        unit: 'ft',
      },
    },
  },
  'mvs-mark-twain': {
    id: 'mvs-mark-twain',
    name: 'Mark Twain Lake',
    lakeName: 'Mark Twain Lake',
    state: 'MO',
    lat: 39.5342,
    lon: -91.6521,
    office: 'MVS',
    cdaLocation: 'Mark Twain Lk-Salt',
    swpaCode: 'CAN',
    nameplate: { units: 2, megawatts: 58 },
    tailwaterFishery: 'warmwater' as const,
    infoPhone: '573-735-4097',
    series: {
      release: {
        tsId: 'Mark Twain Lk-Salt.Flow-Out.Ave.~1Day.1Day.lakerep-rev',
        unit: 'cfs',
        lookbackHours: 72,
        dailyMean: true,
      },
      releaseForecast: {
        tsId: 'Mark Twain Lk-Salt.Flow-Out.Inst.1Hour.0.CWMS-Forecast-NoQPF',
        unit: 'cfs',
        forecast: true,
      },
      poolElevation: { tsId: 'Mark Twain Lk-Salt.Elev.Inst.30Minutes.0.lrgsShef-rev', unit: 'ft' },
    },
  },

  // Kansas City district publishes ZERO timeseries to CDA — verified, and
  // nwk-wc.usace.army.mil is unreachable too. SWPA schedules them anyway, so
  // these two get a generation schedule but no lake level. For a tailwater
  // angler that's the more useful half.
  'nwk-stockton-dam': {
    id: 'nwk-stockton-dam',
    name: 'Stockton Dam',
    lakeName: 'Stockton Lake',
    state: 'MO',
    lat: 37.6672,
    lon: -93.7583,
    swpaCode: 'STD',
    nameplate: { units: 1, megawatts: 52 },
    // Deep release runs cool, but it is a bass fishery, not a trout one.
    tailwaterFishery: 'warmwater' as const,
    series: {},
  },
  'nwk-truman-dam': {
    id: 'nwk-truman-dam',
    name: 'Harry S. Truman Dam',
    lakeName: 'Truman Lake',
    state: 'MO',
    lat: 38.2653,
    lon: -93.4054,
    swpaCode: 'HST',
    nameplate: { units: 6, megawatts: 160 },
    tailwaterFishery: 'warmwater' as const,
    // Kansas City publishes nothing to CWMS, but Ameren's Osage daily report
    // carries Truman's observed pool and outflow — they watch it because its
    // releases feed their lake. About a day in arrears, honestly stamped.
    amerenMetrics: 'truman' as const,
    series: {},
  },

  // Tulsa district. SWPA has always carried these ten projects in the same
  // schedule file Eddy already downloads — the parser read all 18 columns while
  // only 8 were wired to a dam, so the schedules were being parsed and thrown
  // away. Verified against the live feed 2026-08-02: all ten are peaking
  // projects with 16-22 idle hours a day, which is the whole point of the
  // schedule for anyone standing in the tailwater.
  //
  // Three things differ from Little Rock and all three are load-bearing:
  //
  // 1. LOCATION IDS ARE OPAQUE. Tulsa keys projects on four-letter codes, so
  //    `cdaLocation` cannot be derived from a name the way `Table_Rock_Dam`
  //    can. The mapping below was read off /locations?office=SWT, along with
  //    every coordinate and state — take corrections from CWMS, not a gazetteer,
  //    because scripts/check-usace-resolver.ts re-checks against CWMS.
  // 2. DIFFERENT SPELLINGS. Turbine flow is `Flow-Power`, not `Flow-Plant`;
  //    flood pool is `%-Flood Pool Full` on the bare project, not `%-Flood Pool`
  //    on `-Headwater`; tailwater elevation is `Elev-Tailwater` on the bare
  //    project, not `Elev-Downstream` on `-Tailwater`. resolve.ts carries all
  //    three variants, which is why these carry no `series` of their own.
  // 3. NO TAILWATER TEMPERATURE anywhere in the district, so no fishery can be
  //    inferred from a reading here even in principle.
  //
  // `generationOnCfs` is ~2% of SWPA's full-power discharge, rounded to
  // something legible. Calibrated rather than guessed: reading Flow-Power over
  // 2026-08-01/02, most of these sit at exactly 0 with the units off, Denison
  // idles at 19 cfs, Keystone at 200 and Eufaula at 230 — so a flat 100 would
  // have read "generating" all night at the two biggest offenders, and scaling
  // by plant size clears every observed idle value.
  'swt-tenkiller-dam': {
    id: 'swt-tenkiller-dam',
    name: 'Tenkiller Ferry Dam',
    lakeName: 'Tenkiller Ferry Lake',
    state: 'OK',
    lat: 35.59667,
    lon: -95.04917,
    office: 'SWT',
    cdaLocation: 'TENK',
    swpaCode: 'TKD',
    // The Lower Illinois below the dam is a deep-release, year-round designated
    // trout fishery — Oklahoma's other one besides Mountain Fork. Declared, not
    // inferred: SWT publishes no water temperature at all.
    tailwaterFishery: 'trout' as const,
    generationOnCfs: 100,
    series: {},
  },
  'swt-fort-gibson-dam': {
    id: 'swt-fort-gibson-dam',
    name: 'Fort Gibson Dam',
    lakeName: 'Fort Gibson Lake',
    state: 'OK',
    lat: 35.87111,
    lon: -95.22861,
    office: 'SWT',
    cdaLocation: 'FGIB',
    swpaCode: 'FGD',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 200,
    series: {},
  },
  'swt-broken-bow-dam': {
    id: 'swt-broken-bow-dam',
    name: 'Broken Bow Dam',
    lakeName: 'Broken Bow Lake',
    state: 'OK',
    lat: 34.14306,
    lon: -94.69444,
    office: 'SWT',
    cdaLocation: 'BROK',
    swpaCode: 'BBD',
    // Lower Mountain Fork — cold hypolimnetic release, Oklahoma's premier
    // year-round trout tailwater. The strongest candidate if Eddy ever carries
    // an Oklahoma river.
    tailwaterFishery: 'trout' as const,
    generationOnCfs: 150,
    series: {},
  },
  'swt-eufaula-dam': {
    id: 'swt-eufaula-dam',
    name: 'Eufaula Dam',
    lakeName: 'Eufaula Lake',
    state: 'OK',
    lat: 35.30694,
    lon: -95.3625,
    office: 'SWT',
    cdaLocation: 'EUFA',
    swpaCode: 'EUF',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 300,
    series: {},
  },
  'swt-keystone-dam': {
    id: 'swt-keystone-dam',
    name: 'Keystone Dam',
    lakeName: 'Keystone Lake',
    state: 'OK',
    lat: 36.15167,
    lon: -96.25167,
    office: 'SWT',
    cdaLocation: 'KEYS',
    swpaCode: 'KEY',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 250,
    series: {},
  },
  'swt-denison-dam': {
    id: 'swt-denison-dam',
    name: 'Denison Dam',
    lakeName: 'Lake Texoma',
    // CWMS files the project in TX; SWPA's table says "OK-TX" and the nearest
    // town is Colbert, OK. The dam is on the state line. CWMS wins because it
    // is the source the smoke script re-checks — do not "fix" this to OK.
    state: 'TX',
    lat: 33.81806,
    lon: -96.57222,
    office: 'SWT',
    cdaLocation: 'DENI',
    swpaCode: 'DEN',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 200,
    series: {},
  },

  // The four Arkansas River navigation locks & dams. These are run-of-river
  // barge pools rather than float destinations, so they are grouped apart on
  // the index — but their generation schedule is as real as any other, and
  // Dardanelle and Ozark are big plants (148 and 115 MW scheduled).
  'swt-robert-s-kerr-dam': {
    id: 'swt-robert-s-kerr-dam',
    name: 'Robert S. Kerr Lock & Dam',
    lakeName: 'Robert S. Kerr Reservoir',
    state: 'OK',
    lat: 35.34791,
    lon: -94.77846,
    office: 'SWT',
    cdaLocation: 'ROBE',
    swpaCode: 'RSK',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 900,
    suppressMetrics: ['pctFloodPool'],
    series: {},
  },
  'swt-webbers-falls-dam': {
    id: 'swt-webbers-falls-dam',
    name: 'Webbers Falls Lock & Dam',
    lakeName: 'Webbers Falls Reservoir',
    state: 'OK',
    lat: 35.55445,
    lon: -95.16773,
    office: 'SWT',
    cdaLocation: 'WEBB',
    swpaCode: 'WFD',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 700,
    suppressMetrics: ['pctFloodPool'],
    series: {},
  },
  // Ozark and Dardanelle are LITTLE ROCK projects, not Tulsa ones, and Little
  // Rock files them under yet another scheme: `LD12_Ozark`, `LD10_Dardanelle`.
  // They do not fit swlSeries() — release is `Flow-Res Out.Inst.1Hour.0.CCP-Comp`
  // and generation is `Flow-Plant.Ave.1Hour.1Hour.Decodes-rev`, neither of which
  // matches the six reservoir dams — so they resolve rather than transcribe.
  // Neither publishes % flood pool.
  'swl-ozark-dam': {
    id: 'swl-ozark-dam',
    name: 'Ozark Lock & Dam',
    lakeName: 'Ozark Lake',
    state: 'AR',
    lat: 35.47333,
    lon: -93.81,
    office: 'SWL',
    cdaLocation: 'LD12_Ozark',
    // SWPA is internally inconsistent about this project's code — its schedule
    // header says OZK and its project table says OZD. `OZK` is what the column
    // is keyed on, which is the spelling that has to be here; SWPA_CODE_ALIASES
    // in swpa.ts covers the day they swap.
    swpaCode: 'OZK',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 1_500,
    series: {},
  },
  'swl-dardanelle-dam': {
    id: 'swl-dardanelle-dam',
    name: 'Dardanelle Lock & Dam',
    lakeName: 'Lake Dardanelle',
    state: 'AR',
    lat: 35.24731,
    lon: -93.17323,
    office: 'SWL',
    cdaLocation: 'LD10_Dardanelle',
    swpaCode: 'DAD',
    tailwaterFishery: 'warmwater' as const,
    generationOnCfs: 1_000,
    series: {},
  },

  // Nashville district — the upper Cumberland trout tailwaters. Every id below
  // was confirmed live against CDA on 2026-08-15; the probes and floor
  // calibration are in scripts/ingestion/dossiers/verified-identifiers-
  // tailwater-lrn-*.md. Every LRN series is stamped US/Central, so nothing
  // about the Central-day arithmetic in shared/ changes for these.
  //
  // Three dams, not eight: Wolf Creek -> Cumberland, Center Hill -> Caney Fork
  // and Dale Hollow -> Obey are the serious trout tailwaters, which is the
  // audience the dam section serves. The four navigation mainstem projects and
  // Laurel are deliberately absent until someone argues for them.
  //
  // Four things differ from every district above, and all four are load-bearing:
  //
  // 1. NO SWPA COLUMN. Cumberland power is marketed by SEPA, which publishes no
  //    hourly loading page — so no swpaCode, no `schedule`, and no published
  //    MW/cfs reference pair (`generationReference` stays absent and the
  //    console shows raw cfs). The forward view EXISTS: LRN writes its
  //    operating forecast into CWMS itself as hourly `celrn-cwms-forecast`
  //    series, ALREADY IN CFS, running ~9 days ahead (`Wolf Creek Dam-Turbines
  //    .Flow` read 121 hourly points on 2026-08-15, textbook peaking blocks).
  //    That series rides the wire as `generationForecast` WINDOWS — absolute
  //    instants, built in src/lib/data/dam-forecast.ts — never through
  //    `schedule`, whose hour-ending megawatt rows are SWPA's shape. CAUTION:
  //    the forecast series RETAINS ITS PAST, byte-identical to the observed
  //    series, so the builder slices at now; anything else reading it must
  //    too, or it will present a plan as a record.
  //
  // 2. TWO STATION PREFIXES PER PROJECT. Observed series hang off NWS handbook
  //    stations — RWNK2-WOLF_CREEK (tailwater) vs WLCK2-WOLF_CREEK (dam/pool) —
  //    while the forecast lives under prose names ('Wolf Creek Dam'). No single
  //    `cdaLocation` prefix spans that, so these dams carry `cdaLocations`
  //    (plural) instead and the resolver searches all three namespaces. The
  //    explicit ids below still WIN, exactly as everywhere else — resolution
  //    exists here for rename-recovery, and check-usace-resolver.ts covers
  //    these dams like any other.
  //
  // 3. A THIRD PARAMETER VOCABULARY. Turbine flow is `Flow-Turbine` (not
  //    `Flow-Plant`/`Flow-Power`), pool is `Elev-Pool` (not `Elev` on
  //    `-Headwater`), tailwater stage is `Elev-Tail` on the station (not
  //    `Elev-Downstream` on `-Tailwater`), temperature is `Temp-Water-Tail`,
  //    and total discharge is BARE `Flow`. All of it is in resolve.ts SPECS,
  //    each spelling beside the district that taught it; bare Flow is ranked
  //    last there because it is the one generic name in the file.
  //
  // 4. `man-rev` IS THE LIVE VERSION, not just the reviewed one. RWNK2's
  //    dcp-rev tailwater stage stopped 2025-10-24 while man-rev is current —
  //    at LRN the raw feed dying is a thing that happens, so the reviewed
  //    series wins on liveness, not just quality. The exception is tailwater
  //    temperature, which exists only as 30-minute dcp-rev.
  //
  // Floors: measured over 2026-08-03..15, ~300 hourly points per dam. Idle
  // hours read exactly 0 at all three; Center Hill and Dale Hollow occasionally
  // report 25-50 cfs with the units off; the smallest real single-unit hour
  // observed was 1,580 cfs (Dale Hollow). 100 clears the noise with 15x
  // headroom below the smallest unit.
  'lrn-wolf-creek-dam': {
    id: 'lrn-wolf-creek-dam',
    name: 'Wolf Creek Dam',
    lakeName: 'Lake Cumberland',
    state: 'KY',
    // WLCK2-WOLF_CREEK, public-name "Wolf Creek Dam" in /locations — the same
    // CWMS-wins rule as the Tulsa block.
    lat: 36.868333,
    lon: -85.146944,
    office: 'LRN',
    cdaLocations: ['RWNK2-WOLF_CREEK', 'WLCK2-WOLF_CREEK', 'Wolf Creek Dam'],
    // 6 x 45 MW. DOE Wolf Creek recon report; verified 2026-08-15.
    nameplate: { units: 6, megawatts: 270 },
    // Cold hypolimnetic release; Kentucky's trophy brown trout tailwater, with
    // the Wolf Creek National Fish Hatchery directly below the dam — the
    // station's own Flow-Hatchery series names it. Declared, not inferred:
    // the RWNK2 temperature sensor has been dead since 2022-02, so there is no
    // reading to infer from.
    tailwaterFishery: 'trout' as const,
    generationOnCfs: 100,
    series: {
      release: { tsId: 'RWNK2-WOLF_CREEK.Flow.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      releaseForecast: {
        tsId: 'Wolf Creek Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      generationFlow: { tsId: 'RWNK2-WOLF_CREEK.Flow-Turbine.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      generationForecast: {
        tsId: 'Wolf Creek Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      poolElevation: { tsId: 'WLCK2-WOLF_CREEK.Elev-Pool.Inst.1Hour.0.man-rev', unit: 'ft' },
      inflow: { tsId: 'WLCK2-WOLF_CREEK.Flow-In.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      tailwaterElevation: { tsId: 'RWNK2-WOLF_CREEK.Elev-Tail.Inst.1Hour.0.man-rev', unit: 'ft' },
    },
  },
  'lrn-center-hill-dam': {
    id: 'lrn-center-hill-dam',
    name: 'Center Hill Dam',
    lakeName: 'Center Hill Lake',
    state: 'TN',
    // CEHT1-CENTER_HILL, public-name "Center Hill Dam".
    lat: 36.0963889,
    lon: -85.8205556,
    office: 'LRN',
    cdaLocations: ['CETT1-CENTER_HILL', 'CEHT1-CENTER_HILL', 'Center Hill Dam'],
    // 3 x 45 MW rated. The 2015-2021 Voith rehab kept the 135 rating (one
    // trade headline said 155; the plant profile and the Corps' own marker say
    // 135,000 kW). Verified 2026-08-15.
    nameplate: { units: 3, megawatts: 135 },
    // The Caney Fork — Tennessee's most heavily fished trout tailwater. The
    // deep-draw fact is measurable here: Temp-Water-Tail read 50.5 F on
    // 2026-08-15, in August.
    tailwaterFishery: 'trout' as const,
    generationOnCfs: 100,
    series: {
      release: { tsId: 'CETT1-CENTER_HILL.Flow.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      releaseForecast: {
        tsId: 'Center Hill Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      generationFlow: {
        tsId: 'CETT1-CENTER_HILL.Flow-Turbine.Ave.1Hour.1Hour.man-rev',
        unit: 'cfs',
      },
      generationForecast: {
        tsId: 'Center Hill Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      poolElevation: { tsId: 'CEHT1-CENTER_HILL.Elev-Pool.Inst.1Hour.0.man-rev', unit: 'ft' },
      inflow: { tsId: 'CEHT1-CENTER_HILL.Flow-In.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      tailwaterElevation: { tsId: 'CETT1-CENTER_HILL.Elev-Tail.Inst.1Hour.0.man-rev', unit: 'ft' },
      tailwaterTempF: {
        tsId: 'CETT1-CENTER_HILL.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev',
        unit: 'F',
      },
    },
  },
  'lrn-dale-hollow-dam': {
    id: 'lrn-dale-hollow-dam',
    name: 'Dale Hollow Dam',
    lakeName: 'Dale Hollow Lake',
    state: 'TN',
    // DLHT1-DALE_HOLLOW, public-name "Dale Hollow Dam".
    lat: 36.538333,
    lon: -85.451111,
    office: 'LRN',
    cdaLocations: ['DHTT1-DALE_HOLLOW', 'DLHT1-DALE_HOLLOW', 'Dale Hollow Dam'],
    // 3 x 18 MW. Corps' own project history; verified 2026-08-15.
    nameplate: { units: 3, megawatts: 54 },
    // The Obey — trout water below a dam with its own national fish hatchery
    // (Flow-Hatchery series, same as Wolf Creek), and the water that produced
    // the long-standing world-record brown trout. Temp-Water-Tail read 50.7 F
    // on 2026-08-15.
    tailwaterFishery: 'trout' as const,
    generationOnCfs: 100,
    series: {
      release: { tsId: 'DHTT1-DALE_HOLLOW.Flow.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      releaseForecast: {
        tsId: 'Dale Hollow Dam.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      generationFlow: {
        tsId: 'DHTT1-DALE_HOLLOW.Flow-Turbine.Ave.1Hour.1Hour.man-rev',
        unit: 'cfs',
      },
      generationForecast: {
        tsId: 'Dale Hollow Dam-Turbines.Flow.Ave.1Hour.1Hour.celrn-cwms-forecast',
        unit: 'cfs',
        forecast: true,
      },
      poolElevation: { tsId: 'DLHT1-DALE_HOLLOW.Elev-Pool.Inst.1Hour.0.man-rev', unit: 'ft' },
      inflow: { tsId: 'DLHT1-DALE_HOLLOW.Flow-In.Ave.1Hour.1Hour.man-rev', unit: 'cfs' },
      tailwaterElevation: { tsId: 'DHTT1-DALE_HOLLOW.Elev-Tail.Inst.1Hour.0.man-rev', unit: 'ft' },
      tailwaterTempF: {
        tsId: 'DHTT1-DALE_HOLLOW.Temp-Water-Tail.Inst.30Minutes.0.dcp-rev',
        unit: 'F',
      },
    },
  },
  // ── The first non-federal dam. ─────────────────────────────────────────────
  // Bagnell is Ameren Missouri's, operated under FERC license No. 459 — no
  // Corps district, no CWMS, no SWPA column. Its numbers come from Ameren's
  // own hydro reporting API (src/lib/ameren/osage.ts, verified live
  // 2026-08-15): hourly pool, tailwater and discharge, with the observed
  // half of Truman riding along in the same daily report.
  //
  // The registry keeps its name for now — one non-federal entry does not
  // justify the churn of renaming a file every consumer imports — but this
  // entry is the precedent: `amerenMetrics` is the shape a non-CWMS metrics
  // source takes, and Powersite (Liberty Utilities, below Taneycomo) is the
  // next dam that will want one. See docs/DAM_EXPANSION_SURVEY_2026-08.md.
  //
  // What Bagnell deliberately does NOT have:
  // - generationFlow. Ameren publishes total discharge only, so `generating`
  //   stays null — "not measured", never inferred from discharge, because
  //   Bagnell spills through gates as well as turbines and reading gate flow
  //   as generation is exactly the claim releaseExcludesGeneration exists to
  //   forbid elsewhere.
  // - a schedule or forecast. Releases can start at any time; the dam
  //   sounds a siren before starting or stopping generators (Ameren's own
  //   safety line, and the page copy says so). The daily report's
  //   "anticipated discharge today" is a single stated figure, not an hourly
  //   plan — surfacing it is follow-up work with its own copy discipline.
  'ameren-bagnell-dam': {
    id: 'ameren-bagnell-dam',
    name: 'Bagnell Dam',
    lakeName: 'Lake of the Ozarks',
    state: 'MO',
    // Wikipedia/FERC relicensing records; no CWMS location exists to prefer.
    lat: 38.2019,
    lon: -92.6228,
    // 8 main units x 21.5 MW = 172; licensed capacity 176 with the two
    // station-service units. The FERC Biological Opinion's own figure —
    // "8 main turbines … total installed capacity of 176.0 MW" — is what
    // ships. Verified 2026-08-15.
    nameplate: { units: 8, megawatts: 176 },
    // The Osage below is paddlefish, catfish and crappie water — a warmwater
    // release off a shallow reservoir, nothing hypolimnetic about it.
    tailwaterFishery: 'warmwater' as const,
    // Ameren's recorded daily report line for Lake of the Ozarks operations.
    infoPhone: '573-365-9205',
    amerenMetrics: 'osage' as const,
    series: {},
  },
};

export type UsaceDamId = keyof typeof USACE_DAMS;

/**
 * Dams that publish a release timeseries, and so can back a gauge_stations row
 * through the flow-provider pipeline. Schedule-only dams (Stockton, Truman)
 * are deliberately excluded — they have no reading to ingest.
 */
export const USACE_RELEASE_SITE_IDS = Object.values(USACE_DAMS)
  .filter((d) => d.series.release)
  .map((d) => d.id);

export function getUsaceDam(id: string | null | undefined): UsaceDam | null {
  if (!id) return null;
  return USACE_DAMS[id] ?? null;
}

export function getUsaceSeries(id: string, metric: UsaceMetric): UsaceSeries | null {
  return getUsaceDam(id)?.series[metric] ?? null;
}

/**
 * Whether this project has a powerhouse whose generation Eddy may report.
 *
 * ── Why this is not `Boolean(swpaCode)` ────────────────────────────────────
 * It was, in two places — `hasTurbines` on the wire and the history cron's
 * filter — and those two facts are not the same question:
 *
 *   a powerhouse EXISTS                 ← a fact about the concrete
 *   somebody publishes its SCHEDULE     ← a fact about SWPA's file
 *
 * Every dam Eddy carries today answers both the same way, so the conflation
 * cost nothing and was invisible. It stops being invisible at the first Corps
 * hydro project SWPA does not schedule — DeGray, Narrows/Lake Greeson and
 * Blakely Mountain are the near candidates, and CWMS publishes turbine flow
 * for all three. Under the old rule each would have reported "this project has
 * no powerhouse" while the district was serving its Flow-Plant series, which
 * is the same class of error as calling a feed outage an idle plant: an
 * absence of ONE fact rendered as the absence of a DIFFERENT one.
 *
 * ── Why `nameplate` and not "has a turbine" ────────────────────────────────
 * Wappapello is the case that decides it. It has a turbine — 175 kW of
 * station service, enough to run the dam's own lights — and it must stay
 * FALSE here, because it never peaks, has no schedule, and reporting
 * "generating" for it would answer a question nobody asked about water nobody
 * is standing in. So the test is not "is there a turbine" but "does Eddy
 * describe a PLANT here", which is exactly what `nameplate` records.
 *
 * ── Why it stays declarable without a fetch ────────────────────────────────
 * usace-registry.test.ts pins this: /dams/[damId] once used
 * `schedule.length === 0` to mean "no powerhouse", so a stale SWPA file made
 * Table Rock's four units vanish from the page while the card beside it read
 * "Generating". Whether a dam HAS turbines may never depend on a fetch — so
 * this reads two static fields and never the resolver.
 */
export function hasPowerhouse(dam: UsaceDam): boolean {
  return Boolean(dam.swpaCode || dam.nameplate);
}

/**
 * Whether the hourly history cron will read this project at all.
 *
 * ── Why this is a function here and not an expression in the route ─────────
 * It was an expression in the route — `hasPowerhouse(d) && d.office &&
 * d.cdaLocation` — and it silently dropped the three Nashville dams from
 * 2026-08-22, when the branch carrying `cdaLocations` merged to main. LRN
 * keys observed series on two station prefixes per project, so those entries
 * carry the PLURAL field and no `cdaLocation`; the filter tested only the
 * singular. `seriesFor()` reads both shapes, so the dam pages went on showing
 * live metrics from the same registry while the recorder wrote nothing —
 * which is exactly why nobody saw it. Measured on 2026-08-24: the three had
 * been frozen at 08-22 16:00 for 53 hours while every other dam was 2-4 hours
 * fresh, and CWMS was serving the missing window the whole time.
 *
 * The location test has to mirror `seriesFor()`'s own
 * `cdaLocations ?? cdaLocation` fallback, and the only way to keep two
 * expressions in step is to stop having two. So the predicate lives here,
 * beside `hasPowerhouse`, where the registry test can import it WITHOUT
 * importing the route — the route pulls in next/server and the admin client,
 * which no unit test should need.
 *
 * ── Why the cost of being wrong is asymmetric ──────────────────────────────
 * A dam wrongly included fetches a series that 404s and writes nothing: one
 * wasted request an hour. A dam wrongly excluded loses hours that cannot be
 * recovered once they fall out of CWMS's rolling window. So when in doubt
 * this should return TRUE.
 */
export function recordsHistory(dam: UsaceDam): boolean {
  const hasLocation = Boolean(dam.cdaLocation || dam.cdaLocations?.length);
  return Boolean(hasPowerhouse(dam) && dam.office && hasLocation);
}

/**
 * Metrics the history recorder stores, and the shape a dam must declare for
 * `recordsHistory` to be the RIGHT answer rather than merely a permissive one.
 *
 * Kept beside the predicate because the registry test pairs them: a dam that
 * declares an hourly series in either metric and does not pass
 * `recordsHistory` is the 2026-08-22 defect, reintroduced.
 *
 * `dailyMean` is excluded deliberately, and it is the reason this is not just
 * `Object.keys(dam.series).length`. St. Louis publishes release as a daily
 * average about a day in arrears; the recorder skips it (route.ts) because
 * averaging one day into 24 identical bars would draw a flat week and call it
 * a generation pattern. A dam whose only history metric is a daily mean is
 * therefore correctly silent, and must not fail the test.
 */
export function declaresHourlyHistory(dam: UsaceDam): boolean {
  return (['release', 'generationFlow'] as const).some((metric) => {
    const series = dam.series[metric];
    return Boolean(series && !series.dailyMean);
  });
}

/**
 * Pomme de Terre is genuinely absent from both sources — not a config gap.
 * Named so its absence reads as a finding rather than an oversight.
 */
export const KNOWN_UNPUBLISHED = [
  { name: 'Pomme de Terre Dam', river: 'Pomme de Terre River', reason: 'no CWMS timeseries, no SWPA turbines' },
] as const;

/**
 * SWPA project codes deliberately NOT wired to a dam, with the reason.
 *
 * This list exists because its absence caused a real gap: SWPA's schedule
 * carries 18 projects and the parser read all of them, but only 8 had a dam, so
 * ten schedules were parsed and discarded for months with nothing anywhere
 * saying that was a choice. A test asserts every SWPA_PROJECTS key is either
 * claimed by a dam or named here, so the next gap has to be argued for rather
 * than merely happening.
 *
 * Empty today: all 18 projects are wired. `OZD` is the duplicate spelling of
 * `OZK` and resolves through SWPA_CODE_ALIASES, so it needs no entry.
 */
export const UNWIRED_SWPA_PROJECTS: ReadonlyArray<{ code: string; reason: string }> = [];
