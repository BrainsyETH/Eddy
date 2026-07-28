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
// instead. A dam needs only `office` + `cdaLocation` to work — verified
// against Nimrod_Dam, which is not in this file and still resolves six live
// metrics.
//
// The explicit ids below are kept and still WIN, because they were confirmed
// against the API and a resolver that silently picks the wrong series is worse
// than a hardcoded one that 404s loudly. The resolver fills gaps; it does not
// override. Recovering automatically from a RENAMED series (rather than just a
// missing one) is the remaining half of that idea and is not built yet.

export type UsaceOffice = 'SWL' | 'MVS';

export type UsaceMetric =
  | 'release'
  | 'releaseForecast'
  | 'poolElevation'
  | 'pctFloodPool'
  | 'inflow'
  | 'generationFlow'
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
  state: 'MO' | 'AR';
  lat: number;
  lon: number;
  /** CWMS office, when this dam publishes to CDA at all. */
  office?: UsaceOffice;
  /** CWMS /locations name. Carries spaces on MVS. */
  cdaLocation?: string;
  /** SWPA column code, when the dam has turbines on the federal grid. */
  swpaCode?: string;
  /**
   * Turbine flow above which the powerhouse counts as running. Table Rock
   * idles around 20 cfs with the units off, so a bare `> 0` test would read
   * "generating" all day.
   */
  generationOnCfs?: number;
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
  tailwater?: { riverSlug: string; gaugeSiteId: string };
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
    // The one tailwater Eddy currently carries. Poplar Bluff (07063000) sits
    // BELOW the dam and is release-driven; Annapolis (07061500) sits above the
    // lake and is not, so it gets no dam treatment.
    tailwater: { riverSlug: 'black', gaugeSiteId: '07063000' },
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
    generationOnCfs: 100,
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
    generationOnCfs: 100,
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
    generationOnCfs: 100,
    series: swlSeries('Norfork_Dam', { turbines: true, tailwaterTemp: false }),
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
 * Pomme de Terre is genuinely absent from both sources — not a config gap.
 * Named so its absence reads as a finding rather than an oversight.
 */
export const KNOWN_UNPUBLISHED = [
  { name: 'Pomme de Terre Dam', river: 'Pomme de Terre River', reason: 'no CWMS timeseries, no SWPA turbines' },
] as const;
