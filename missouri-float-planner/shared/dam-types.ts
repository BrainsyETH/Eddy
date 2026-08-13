// shared/dam-types.ts
//
// The shape of a USACE dam as /api/dams serves it, shared between the web dam
// pages and the eddy-ios dam screen.
//
// ── Why here and not packages/eddy-types ───────────────────────────────────
// That package is where shared API contracts normally live, and it is the wrong
// home for these. Vercel builds with Root Directory = missouri-float-planner/,
// and this app's tsconfig maps only `@/*` and `@shared/*` — it has no path to
// packages/ at all. eddy-types reaches ACROSS that boundary into this directory
// (see its ConditionCode re-export), which is the direction that works. So the
// definitions live here and eddy-types re-exports them, exactly as it does for
// the condition system.
//
// Pure TypeScript, no imports — the same constraint condition-system.ts and
// flow-band.ts are under, so Metro, tsx and Next can all consume it.
//
// ── The contract that matters ──────────────────────────────────────────────
// A metric the dam does not publish is ABSENT from `metrics`, never present
// with a null. Absent means "this dam has no powerhouse", and a UI must render
// nothing rather than "0 cfs" or an em-dash. Clearwater is flood control only;
// Stockton and Truman publish nothing to CWMS at all and exist as SWPA schedule
// entries. Every consumer has to have a nothing-to-show layout.

/** Logical metrics a dam can publish. Optional by design — see the note above. */
export type UsaceMetric =
  | 'release'
  | 'releaseForecast'
  | 'poolElevation'
  | 'pctFloodPool'
  | 'inflow'
  | 'generationFlow'
  | 'tailwaterElevation'
  | 'tailwaterTempF';

/** How live a reading is, decided server-side so every surface agrees. */
export type DamStaleness = 'fresh' | 'lagging' | 'stale';

export interface DamMetricValue {
  value: number;
  unit: string;
  /** ISO timestamp of the observation. */
  at: string;
  staleness: DamStaleness;
  /**
   * True when this is a daily mean rather than a spot reading. The St. Louis
   * district publishes release this way, about a day in arrears. The UI must
   * label it — showing a day-old average as "releasing now" would be a
   * correctness bug, not a cosmetic one.
   */
  dailyMean?: boolean;
  /**
   * How much the value moved over the preceding `hours`, when the series is
   * dense enough to say. Absent means it could not be computed, never "flat".
   *
   * ── Why a signed number and not "rising" / "falling" ───────────────────────
   * Because a categorical label needs a threshold, and there is no threshold
   * that works. Measured over 7 days of hourly tailwater stage at Table Rock,
   * Bull Shoals, Norfork, Greers Ferry and Beaver (2026-08-12), the 3-hour
   * change while the units were IDLE reached 4.0 ft at p99 — the recession limb
   * after a shutdown — while 25% of GENERATING hours moved less than 0.23 ft,
   * because steady generation holds the tailwater high and flat. The two
   * distributions overlap across the whole range a threshold could sit in, so
   * any "rising/steady/falling" verdict would be confidently wrong a good part
   * of the time.
   *
   * A number cannot be wrong that way. "+2.1 ft in 3h" also tells a wading
   * angler strictly more than "rising" does.
   */
  trend?: {
    /** Window the change was measured over. */
    hours: number;
    /** Signed change in the metric's own unit, latest minus oldest. */
    delta: number;
  };
}

/** One hour of a project's schedule, in SWPA's own "hour ending" terms. */
export interface ScheduledHour {
  /**
   * Hour ENDING, 1-24, exactly as SWPA posts it. Hour 14 means the release runs
   * 1:00pm-2:00pm. Getting this wrong by one puts an angler in the water an
   * hour early, so it is kept in the source's terms rather than renormalised.
   * Render it through shared/dam-schedule-copy.ts, never by hand.
   */
  hourEnding: number;
  megawatts: number;
  /**
   * Estimated release, or null on an idle hour.
   *
   * Rounded to 100 cfs because the megawatt conversion measured within ~10% at
   * steady state. Do not print it on a ramp hour — see isRamp.
   */
  cfs: number | null;
  /**
   * True when scheduled MW changed this hour, which makes the cfs estimate
   * unreliable: units spin up partway through the hour while CWMS reports an
   * hourly average, and measured error ran -41% to +117%. The on/off PATTERN is
   * exact; the magnitude on these hours is not.
   */
  isRamp: boolean;
}

export interface DamScheduleDay {
  /** Calendar date the schedule covers (America/Chicago), YYYY-MM-DD. */
  scheduleDate: string;
  /** 24 entries, hour-ending 1..24. */
  hours: ScheduledHour[];
  /**
   * Contiguous GENERATION-IDLE stretches.
   *
   * NOT "wading windows", which is what this said until a tailwater with eight
   * peaking units made the difference matter. The schedule describes a
   * powerhouse. Non-power release continues while the units are idle, water
   * released hours ago is still moving downstream, and neither is visible
   * here — so an idle hour is a fact about generation and a guess about the
   * river. dam-schedule-copy.ts holds the same line in user-facing wording
   * ("No generation scheduled", never "Water off"); this is the contract
   * saying it too.
   */
  idle: Array<{ from: number; to: number }>;
  /**
   * When EDDY FETCHED this schedule — not when SWPA posted it, which the source
   * does not publish at all. Label it accordingly: "Eddy last checked", never
   * "last updated". Null when unknown, and null must render nothing rather than
   * fall back to the current time.
   */
  retrievedAt: string | null;
}

/**
 * The reach below a dam, when Eddy carries it.
 *
 * Only a TAILWATER qualifies — a river whose level IS the release. A river that
 * merely feeds the pool is deliberately excluded, because a dam matters to a
 * floater because of the water below it. Most dams have none.
 */
export interface DamTailwater {
  riverSlug: string;
  gaugeSiteId: string;
  /**
   * The `river_sections` reach the release actually lands in, when the river
   * carries more than one.
   *
   * On the Black, the river page opens on the spring-fed Lesterville float,
   * which is NOT the water Clearwater controls — so a dam panel that linked the
   * river alone would point a reader at a reach the dam has no bearing on.
   * Optional: a tailwater that is its own river needs no reach.
   *
   * CONSUMED, in two places, and neither is obvious from here: the iOS dam
   * screen passes it as `section` when pushing the river screen, and the web
   * river hub feeds it to RiverReaches as `highlightSlug`. It was dropped from
   * this type once already and silently lost on the wire, which is why
   * dams-route-contract.test.ts asserts it survives assembly.
   */
  sectionSlug?: string;
}

/**
 * One Central-time day of OBSERVED hourly flow at a project.
 *
 * Both arrays are 24 entries, indexed 0..23 for hour-ending 1..24, matching
 * ScheduledHour.hourEnding so an observed hour and a scheduled hour line up
 * without any client doing arithmetic.
 *
 * `null` means NO OBSERVATION WAS STORED for that hour — a feed gap, a dam that
 * was not yet wired, a retention boundary. It is emphatically not zero, and a
 * renderer that draws it as an empty bar has just told somebody the units were
 * off during an outage. Missing data gets its own visual treatment.
 */
export interface DamPatternDay {
  /** Central calendar day, YYYY-MM-DD. */
  scheduleDate: string;
  /** Hourly mean turbine discharge, cfs. */
  turbineCfs: Array<number | null>;
  /** Hourly mean total release at the dam, cfs. */
  totalReleaseCfs: Array<number | null>;
}

export interface DamSnapshot {
  id: string;
  name: string;
  lakeName: string | null;
  state: string;
  lat: number;
  lon: number;
  hasTurbines: boolean;
  /** Nameplate plant, when the dam has one. Not SWPA's scheduling capacity. */
  nameplate?: { units: number; megawatts: number };
  /**
   * SWPA's published reference pair for this project, and who published it.
   *
   * ── Why the CONSTANTS travel and the DERIVED NUMBERS do not ───────────────
   * A client cannot compute "31% of full-generation discharge" without the
   * denominator, and the SWPA table lives in src/ where neither eddy-ios nor
   * shared/ can reach it. So the pair rides the wire, and shared/dam-generation.ts
   * does the arithmetic on both platforms from one implementation.
   *
   * The percentage itself is NOT sent, and neither is the next scheduled
   * transition. Both are answers to "as of when", and a value stamped at
   * snapshot assembly then frozen is the mistake DamMetricValue.staleness
   * already made — see readingStaleness in dam-schedule-copy.ts. Constants have
   * no clock and are safe to freeze; conclusions about the present are not.
   *
   * Absent for a dam with no SWPA project code. Optional for the reason every
   * added field here is: a TestFlight build outlives the deploy it was cut
   * against, so absent means "this deploy does not send one".
   */
  generationReference?: {
    units: number;
    fullGenerationCfs: number;
    schedulingCapacityMw: number;
    source: string;
  };
  /**
   * Turbine flow at or below which this project's units count as off.
   *
   * The registry's `generationOnCfs`, and the same number `generating` above is
   * derived from — on the wire so a client can tell "measured at effectively
   * zero" from "not measured", which is the distinction the whole
   * missing-data discipline turns on. CWMS reports real leakage through idle
   * turbines (~20 cfs at Table Rock), so `value > 0` is not the test.
   */
  generationFloorCfs?: number;
  /** The zone every `scheduleDate` and hour-ending in this payload is keyed to. */
  scheduleTimeZone?: 'America/Chicago';
  /**
   * What lives in the water below. A property of the PROJECT — a deep-draw
   * release runs cold year-round and makes a trout tailwater — and declared
   * rather than inferred from a temperature reading, because Norfork is a
   * premier trout tailwater that publishes no water temperature at all.
   */
  tailwaterFishery?: 'trout' | 'warmwater';
  /** Recorded release line — the fallback when a feed is down. */
  infoPhone?: string;
  /** Present metrics only. An absent key means the dam does not publish it. */
  metrics: Partial<Record<UsaceMetric, DamMetricValue>>;
  /** Generating right now, or NULL when the dam publishes no turbine flow. */
  generating: boolean | null;
  /** Hourly forward schedule, today first. Empty when the dam has no SWPA code. */
  schedule: DamScheduleDay[];
  /**
   * What the powerhouse ACTUALLY DID, hour by hour, over the past week.
   *
   * Detail payload only — a twenty-dam index has no room to draw it and no
   * reason to pay for it.
   *
   * The pattern strip this feeds is the one thing on the page that answers "is
   * this a dam that runs mornings, or a dam that runs afternoons" — the
   * question a visiting angler is actually asking a week out. Its past half
   * MUST come from here and never from an old schedule: a schedule is what was
   * planned, and redrawing it as history would present a plan as a record of
   * the river.
   */
  pattern?: DamPatternDay[];
  /** Where the numbers came from, for attribution in the UI. */
  sources: string[];
  /** The reach this dam controls, when Eddy carries it. Absent for most. */
  tailwater?: DamTailwater;
}

/**
 * GET /api/dams.
 *
 * NOTE the asymmetry with the detail route, which returns a DamSnapshot BARE
 * rather than under a key. Every other detail endpoint in this API wraps its
 * payload, so a client reflexively reading `data.dam` there gets undefined.
 */
export interface DamsResponse {
  dams: DamSnapshot[];
}
