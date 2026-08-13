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
export type UsaceOffice = 'SWL' | 'MVS' | 'SWT';

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
  /**
   * Kept a union rather than `string` for the same reason as UsaceOffice: it is
   * a display key that groups the index, and a typo would silently create a
   * one-dam group nobody notices. `DamSnapshot.state` on the wire is already
   * `string`, so widening this costs nothing downstream.
   */
  state: 'MO' | 'AR' | 'OK' | 'TX';
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
  /**
   * `sectionSlug` names the river_sections reach the release actually lands in
   * (migrations 00204/00205), so a dam can point at the tailwater rather than at
   * the whole river — on the Black, the river page opens on the spring-fed
   * Lesterville float, which is not the water this dam controls. Optional: a
   * tailwater that is its own river needs no reach.
   *
   * ── Two signals, two fields ───────────────────────────────────────────────
   * This carried a single `gaugeSiteId` while exactly one tailwater existed,
   * and on the Black the two roles happen to collapse: Clearwater releases,
   * and 07063000 measures that release 40 river miles down, 5% apart. Bull
   * Shoals is where they come apart. Its release is published by the Corps at
   * the dam; the nearest USGS stage gauge is 45 miles down and BELOW the North
   * Fork confluence, so it reads Bull Shoals plus Norfork; the next one is 62
   * miles down. One field cannot say which of those a caller wants, and a
   * caller that guesses wrong attributes another dam's water to this one.
   *
   *   releaseStationId       what this dam let out, measured at the dam
   *   downstreamGaugeSiteIds what the river reads, NEAREST FIRST
   *
   * Both are required on a tailwater, because choosing them is the decision —
   * a tailwater that names neither has not been thought about yet.
   */
  tailwater?: {
    riverSlug: string;
    /**
     * The dam's release as a gauge station: `provider='usace'`, with this id
     * as `site_id_external`. Same value as the dam's own id, by construction
     * — named here anyway so the registry states which release drives THIS
     * river rather than leaving it to be inferred from a naming convention.
     */
    releaseStationId: string;
    /**
     * Gauges that measure the water below, nearest first. Nearest first is
     * load-bearing: `[0]` is what the river hub links to, and "nearest" is the
     * only ordering that stays correct as more are added.
     *
     * A gauge here is NOT thereby endorsed as representative of the whole
     * reach. Distance and intervening inflows are recorded in the dossier and
     * in river_gauges, not flattened away by appearing in this list.
     *
     * MAY BE EMPTY, with `noDownstreamGaugeReason` set. Requiring at least one
     * would be the same mistake as requiring three capacity figures: a
     * mandatory field is answered, and the way you answer it when the honest
     * answer is "none" is by reaching for the closest unsuitable thing. Some
     * tailwaters genuinely have no gauge below them — Bull Shoals has none for
     * its first 45 miles, and a shorter reach could have none at all.
     */
    downstreamGaugeSiteIds: string[];
    /**
     * Why the list above is empty. Required when it is, so that "none found"
     * is a recorded research result rather than an unfinished field — the
     * distinction the whole process turns on.
     */
    noDownstreamGaugeReason?: string;
    sectionSlug?: string;
  };
  /**
   * NAMEPLATE generating capacity — deliberately not SWPA's number.
   *
   * SWPA's project table lists short-term overload/scheduling capability,
   * which runs higher: Table Rock is 4x50 MW nameplate but SWPA schedules
   * against 230; Beaver is 112 vs 128; Truman 160 vs 184. Both are correct for
   * their own purpose, so describe the plant with THIS and convert megawatts
   * to cfs with SWPA's pair (see megawattsToCfs) — the conversion needs both
   * halves to come from the same table to stay internally consistent.
   *
   * ── Three numbers, not two ────────────────────────────────────────────────
   * A plant under rehabilitation has a THIRD figure, and Bull Shoals is the
   * case that proved the two-field shape wrong. It shipped here as 380 MW,
   * which matches none of its real values. The Corps' own Major Equipment
   * Replacement fact sheet (Little Rock District, as of 02/27/2026) reads:
   * "an 8-unit hydroelectric plant with a combined installed power capacity of
   * 340 MW. This project will increase the power capacity to 362 MW." SWPA
   * schedules the same plant against 391.
   *
   *   megawatts        340  what the plant can generate today
   *   plannedMegawatts 362  what the MER project raises it to
   *   SWPA capacityMw  391  scheduling capability, in swpa.ts, paired with
   *                         fullPowerCfs and never to be separated from it
   *
   * `plannedMegawatts` is registry-only and deliberately off the wire: nothing
   * renders it, and an unexplained second number beside the first would read
   * as a contradiction. It is here so the next person to "correct" 340 finds
   * the upgrade already recorded, with its source, instead of guessing which
   * of three published figures is the plant.
   */
  nameplate?: { units: number; megawatts: number; plannedMegawatts?: number };
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
    tailwater: {
      riverSlug: 'black',
      releaseStationId: 'swl-clearwater-dam',
      downstreamGaugeSiteIds: ['07063000'],
      sectionSlug: 'lower-markham-hammer',
    },
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
    // 340 today, 362 after the Major Equipment Replacement project; SWPA
    // schedules against 391. See the nameplate field's note — the 380 that
    // stood here matched none of the three.
    nameplate: { units: 8, megawatts: 340, plannedMegawatts: 362 },
    tailwaterFishery: 'trout' as const,
    infoPhone: '870-431-5311',
    generationOnCfs: 100,
    // The second tailwater Eddy carries, and the reason release and downstream
    // gauge became separate fields. Nothing here measures the trophy water:
    // 07057370 is ~45 river miles down and BELOW the North Fork confluence, so
    // it reads Bull Shoals plus Norfork (drainage 8,040 sq mi against this
    // dam's 6,050); 07060500 is ~62 miles down. Between the dam and Rim Shoals
    // there is no live stage or discharge gauge at all — the three USGS
    // stations below the dam publish only temperature and dissolved oxygen.
    // Verified 2026-08-12; see dossiers/verified-identifiers-white-river-bull-shoals.md.
    tailwater: {
      riverSlug: 'white-river-bull-shoals',
      releaseStationId: 'swl-bull-shoals-dam',
      downstreamGaugeSiteIds: ['07057370', '07060500'],
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
    // Publishes no tailwater temperature, yet is a premier trout tailwater —
    // the case that proves this must be declared rather than inferred.
    tailwaterFishery: 'trout' as const,
    infoPhone: '870-431-5311',
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
