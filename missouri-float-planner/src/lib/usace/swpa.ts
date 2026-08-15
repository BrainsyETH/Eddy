// src/lib/usace/swpa.ts
// Southwestern Power Administration generation schedules — the HOURLY forward
// schedule for federal hydro projects, which CWMS cannot provide.
//
// Why this exists alongside the CWMS client: CDA's release forecast is
// `Flow-Res Out.Ave.~1Day.1Day.Forecast`, a DAILY AVERAGE. A daily mean cannot
// answer "can I wade at 7am tomorrow" — it can't tell you the units run
// 7am-11am and again 3pm-9pm. SWPA publishes exactly that, hour by hour, a
// rolling week ahead, and it is the schedule tailwater anglers actually plan
// around.
//
// The source is plain static HTML — one file per weekday, fixed-width text:
//
//   https://www.energy.gov/swpa/{mon,tue,wed,thu,fri,sat,sun}.htm
//
//   PROJECTED LOADING SCHEDULE      MONDAY JULY 27, 2026    CALICO ROCK TEMP: 95
//            1     2     3   ...    12    13    14    15    16    17    18
//     HR   BBD   DEN   KEY   ...   TRD   BSD   NFD   GFD   STD   HST   CAN
//      1     0     0    35   ...     0     7     0     0     0     0     0
//     ...
//    TOT   500     0   840   ...  1500  2241   280   616   600   600   300
//
// Values are megawatts. The page ships its own MW->CFS key in a PROJECT TABLE
// (plant capacity + approximate full-power discharge), which is what
// SWPA_PROJECTS below encodes.
//
// ACCURACY, measured against CWMS Flow-Plant for Table Rock on 2026-07-27:
//   - idle hours are EXACT (0 MW scheduled -> ~20 cfs leakage measured, always)
//   - steady generation lands within ~10% (35 MW -> est 2,298 vs meas 2,463-2,629)
//   - RAMP hours are unreliable (-41% to +117%) because units spin up partway
//     through the hour and CWMS reports an hourly average
// So: the on/off PATTERN is trustworthy and is what matters for wading; the
// cfs is an approximation that must be rounded and never shown on a ramp hour.
// See isRampHour() and the `approximate` flag on ScheduledHour.
//
// This is a scraper against a government page with no version, no content-type
// contract and no changelog. It fails CLOSED — a schedule whose date doesn't
// match what we asked for is dropped, never rendered, because showing last
// week's Tuesday as tomorrow would put someone in the water during generation.
//
// THERE IS NO PUBLICATION TIME. Verified against the live page on 2026-07-28:
// the response carries no Last-Modified (Drupal behind Varnish and CloudFront,
// `cache-control: max-age=600`), and the body — tags stripped — contains no
// "posted", "updated", "as of" or clock time anywhere. SWPA says only which DAY
// a schedule covers.
//
// So `retrievedAt` below is when EDDY FETCHED THE PAGE, and nothing else. It
// must never be presented as when SWPA posted. That distinction is why the
// field is not called `updatedAt`, and why it is null rather than Date.now()
// when it cannot be established — the same fail-closed instinct as the date
// check. See retrievedAtFrom().

const SWPA_BASE = 'https://www.energy.gov/swpa';

/** Per-request ceiling. The pages are ~42 KB of static HTML. */
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Schedules post 2-4 PM CT and don't change for the rest of the day, so this
 * caches far more coarsely than the hourly CWMS observations.
 */
const REVALIDATE_SECONDS = 1_800;

/**
 * The seven file basenames, which are also the lowercased en-US short weekday
 * names — that correspondence is what lets weekdayFileFor derive the file
 * straight from an Intl format in America/Chicago.
 */
export type SwpaWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/**
 * The PROJECT TABLE published on every schedule page, verbatim as of
 * 2026-07-27. Static because it comes from the same page and changes about
 * never — a unit rerate is a multi-year capital project, not a data update.
 *
 * `fullPowerCfs` is the page's own "Approx. Full Power Discharge", the key for
 * turning scheduled megawatts into a release estimate.
 */
export interface SwpaProject {
  /** Column abbreviation in the schedule table. */
  code: string;
  name: string;
  state: string;
  units: number;
  capacityMw: number;
  fullPowerCfs: number;
}

export const SWPA_PROJECTS: Record<string, SwpaProject> = {
  BBD: { code: 'BBD', name: 'Broken Bow', state: 'OK', units: 2, capacityMw: 115, fullPowerCfs: 7_900 },
  DEN: { code: 'DEN', name: 'Denison', state: 'OK-TX', units: 2, capacityMw: 100, fullPowerCfs: 10_400 },
  KEY: { code: 'KEY', name: 'Keystone', state: 'OK', units: 2, capacityMw: 80, fullPowerCfs: 12_000 },
  FGD: { code: 'FGD', name: 'Fort Gibson', state: 'OK', units: 4, capacityMw: 50, fullPowerCfs: 10_900 },
  WFD: { code: 'WFD', name: 'Webbers Falls L&D', state: 'OK', units: 3, capacityMw: 69, fullPowerCfs: 35_000 },
  TKD: { code: 'TKD', name: 'Tenkiller', state: 'OK', units: 2, capacityMw: 45, fullPowerCfs: 4_100 },
  EUF: { code: 'EUF', name: 'Eufaula', state: 'OK', units: 3, capacityMw: 103, fullPowerCfs: 15_100 },
  RSK: { code: 'RSK', name: 'Robert S. Kerr L&D', state: 'OK', units: 4, capacityMw: 126, fullPowerCfs: 45_000 },
  // SWPA is internally inconsistent here: the PROJECT TABLE calls this OZD,
  // but the schedule's own column header says OZK. Both are carried so the
  // column resolves whichever way the page spells it on a given day.
  OZD: { code: 'OZD', name: 'Ozark L&D', state: 'AR', units: 5, capacityMw: 115, fullPowerCfs: 75_000 },
  OZK: { code: 'OZK', name: 'Ozark L&D', state: 'AR', units: 5, capacityMw: 115, fullPowerCfs: 75_000 },
  DAD: { code: 'DAD', name: 'Dardanelle L&D', state: 'AR', units: 4, capacityMw: 148, fullPowerCfs: 50_000 },
  BEV: { code: 'BEV', name: 'Beaver', state: 'AR', units: 2, capacityMw: 128, fullPowerCfs: 8_800 },
  TRD: { code: 'TRD', name: 'Table Rock', state: 'MO', units: 4, capacityMw: 230, fullPowerCfs: 15_100 },
  BSD: { code: 'BSD', name: 'Bull Shoals', state: 'AR', units: 8, capacityMw: 391, fullPowerCfs: 26_400 },
  NFD: { code: 'NFD', name: 'Norfork', state: 'AR', units: 2, capacityMw: 92, fullPowerCfs: 7_200 },
  GFD: { code: 'GFD', name: 'Greers Ferry', state: 'AR', units: 2, capacityMw: 110, fullPowerCfs: 7_900 },
  // Stockton and Truman publish NOTHING to CWMS (Kansas City district posts no
  // timeseries at all), so SWPA is the only source Eddy has for them.
  STD: { code: 'STD', name: 'Stockton', state: 'MO', units: 1, capacityMw: 52, fullPowerCfs: 8_300 },
  HST: { code: 'HST', name: 'Harry S Truman', state: 'MO', units: 6, capacityMw: 184, fullPowerCfs: 65_000 },
  CAN: { code: 'CAN', name: 'Clarence Cannon', state: 'MO', units: 2, capacityMw: 70, fullPowerCfs: 12_900 },
};

/**
 * One hour of a project's schedule — the SAME type the wire carries.
 *
 * Re-exported rather than restated. It was declared twice, identically, here
 * and in shared/dam-types.ts, coupled by nothing but structural compatibility:
 * `readSchedule` assigns this array straight into `DamScheduleDay.hours` and
 * that assignment typechecks whether or not the two definitions still agree.
 * One of them drifting is a wire break with no compile error anywhere.
 *
 * src/ importing from shared/ is the allowed direction — shared/ has no path
 * back, which is what keeps it consumable by Metro and tsx as well as Next.
 */
export type { ScheduledHour } from '@shared/dam-types';
import type { ScheduledHour } from '@shared/dam-types';

/**
 * When Eddy retrieved the page this schedule came from — NOT when SWPA posted
 * it, which the source does not publish (see the header note).
 *
 * Null when it could not be established. Callers must render nothing in that
 * case rather than substituting the current time.
 */
export type RetrievedAt = string | null;

export interface ProjectSchedule {
  projectCode: string;
  /** Local calendar date the schedule covers (America/Chicago), YYYY-MM-DD. */
  scheduleDate: string;
  hours: ScheduledHour[];
  retrievedAt: RetrievedAt;
}

export interface DaySchedule {
  scheduleDate: string;
  /** Keyed by project code; every project on the page. */
  projects: Record<string, ProjectSchedule>;
  retrievedAt: RetrievedAt;
}

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/** Strip tags and decode the handful of entities these pages actually use. */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Pull the authoritative date off the PROJECTED LOADING SCHEDULE line.
 *
 * Deliberately NOT the <title>: on 2026-07-27 tue.htm was titled
 * "TUESDAY, JULY 27, 2026" while its body read "TUESDAY JULY 28, 2026". The
 * title lags; the body line is what the schedule actually covers.
 */
export function parseScheduleDate(text: string): string | null {
  const line = text.split('\n').find((l) => l.includes('PROJECTED LOADING SCHEDULE'));
  if (!line) return null;
  const m = line.match(/([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toUpperCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * When this copy of the schedule page was produced, from the response `Date`.
 *
 * ── Why not Date.now() ─────────────────────────────────────────────────────
 * fetchDaySchedule caches for REVALIDATE_SECONDS, so on a cache hit "now" is
 * the time of THIS request rather than of the fetch — a half-hour-old schedule
 * would report itself as seconds old, forever. Next replays the stored response
 * headers along with the stored body (verified against the live route: the
 * value stays pinned across repeated requests), so reading the header is what
 * keeps this honest across the cache.
 *
 * It is also wrong in a second way: fetchAllDamSummaries parses one cached body
 * once per dam, so Date.now() would stamp ten different times for a single
 * retrieval. A header value is identical by construction — confirmed live, all
 * nine scheduled dams reporting one timestamp.
 *
 * ── Why `Date` ALONE, and not `Date` + `Age` ───────────────────────────────
 * Because the sum lands in the FUTURE. energy.gov sits behind two caches
 * (Varnish, then CloudFront), and measured across three consecutive samples on
 * 2026-07-28:
 *
 *   local == Date (±1s), age 723   -> Date+Age is 12 min ahead of now
 *   Date 510s old,       age 1505  -> Date+Age is 16 min ahead of now
 *   Date 516s old,       age 1510  -> Date+Age is 16 min ahead of now
 *
 * `Age` accumulates across BOTH layers while `Date` is rewritten by one of
 * them, so adding them double-counts. `Date` on its own was never ahead of the
 * clock in any sample, which is the property that matters: this figure feeds a
 * staleness warning, and erring OLD understates freshness where erring NEW
 * would tell someone a schedule is current when it is not.
 *
 * Returns null rather than guessing when `Date` is missing or unparseable. A
 * missing timestamp renders nothing; a wrong one is a false claim about how
 * fresh a safety-adjacent schedule is.
 */
export function retrievedAtFrom(headers: Headers): RetrievedAt {
  const date = headers.get('date');
  if (!date) return null;
  const ms = Date.parse(date);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** MW -> cfs via the page's own project table. Null for an idle hour. */
export function megawattsToCfs(projectCode: string, megawatts: number): number | null {
  const p = SWPA_PROJECTS[projectCode];
  if (!p || megawatts <= 0) return null;
  const cfs = (megawatts / p.capacityMw) * p.fullPowerCfs;
  // Rounded to 100 cfs: the conversion is ~±10% at steady state, so any finer
  // figure would imply precision the schedule does not have.
  return Math.round(cfs / 100) * 100;
}

/**
 * Parse one schedule page into per-project hourly schedules.
 *
 * Returns null when the page doesn't look like a schedule at all — a redirect,
 * an outage page, or a format change. Callers drop the schedule block rather
 * than rendering anything uncertain.
 *
 * `retrievedAt` is optional and defaults to NULL, never to the current time.
 * Parsing a fixture in a test is not a retrieval, and a caller that forgets to
 * pass it should produce an absent timestamp rather than a fabricated one.
 */
export function parseSchedulePage(
  html: string,
  retrievedAt: RetrievedAt = null
): DaySchedule | null {
  const text = toText(html);
  const scheduleDate = parseScheduleDate(text);
  if (!scheduleDate) return null;

  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));

  // Columns are keyed off this header row, never by fixed position — the
  // project set is not guaranteed stable across revisions.
  const headerIdx = lines.findIndex((l) => /^\s*HR\s+[A-Z]{3}(\s+[A-Z]{3})+\s*$/.test(l));
  if (headerIdx === -1) return null;

  const codes = lines[headerIdx].trim().split(/\s+/).slice(1);
  if (codes.length === 0) return null;

  const mwByCode = new Map<string, Map<number, number>>(codes.map((c) => [c, new Map()]));

  for (const line of lines.slice(headerIdx + 1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== codes.length + 1) continue;
    if (parts[0] === 'TOT') break;
    const hourEnding = Number(parts[0]);
    if (!Number.isInteger(hourEnding) || hourEnding < 1 || hourEnding > 24) continue;
    parts.slice(1).forEach((raw, i) => {
      const mw = Number(raw);
      if (Number.isFinite(mw)) mwByCode.get(codes[i])!.set(hourEnding, mw);
    });
  }

  const projects: Record<string, ProjectSchedule> = {};
  for (const code of codes) {
    const byHour = mwByCode.get(code)!;
    // A page missing hours is a format change, not a quiet gap — skip the
    // project rather than presenting a schedule with holes in it.
    if (byHour.size !== 24) continue;
    const hours: ScheduledHour[] = [];
    for (let h = 1; h <= 24; h += 1) {
      const megawatts = byHour.get(h)!;
      const prev = byHour.get(h === 1 ? 24 : h - 1)!;
      hours.push({
        hourEnding: h,
        megawatts,
        cfs: megawattsToCfs(code, megawatts),
        isRamp: megawatts !== prev,
      });
    }
    projects[code] = { projectCode: code, scheduleDate, hours, retrievedAt };
  }

  if (Object.keys(projects).length === 0) return null;
  return { scheduleDate, projects, retrievedAt };
}

/**
 * Which .htm file covers a given instant, by the CENTRAL-time weekday.
 *
 * Must not use date.getDay(): that reads the SERVER's timezone, and on a UTC
 * host it rolls over to tomorrow at 7pm Central (6pm in winter). The file
 * picker then asked for tue.htm while centralDateKey still expected Monday, so
 * the fail-closed date check rejected a perfectly good schedule — and every
 * generation schedule on the site went blank each evening. It looked like SWPA
 * being slow to publish; it was this function.
 */
export function weekdayFileFor(date: Date): SwpaWeekday {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  })
    .format(date)
    .toLowerCase();
  return short as SwpaWeekday;
}

/** YYYY-MM-DD for a date as observed in America/Chicago, where SWPA operates. */
export function centralDateKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Fetch and parse the schedule page covering `date`.
 *
 * FAILS CLOSED: if the page's own date isn't the date we asked for, the
 * schedule is discarded. The seven files are a rolling week, so a stale or
 * not-yet-refreshed file holds a schedule from the PREVIOUS week — rendering
 * that as tomorrow would tell someone the river is safe when it isn't.
 */
export async function fetchDaySchedule(
  date: Date,
  options?: { skipCache?: boolean }
): Promise<DaySchedule | null> {
  const file = weekdayFileFor(date);
  const expected = centralDateKey(date);
  const url = `${SWPA_BASE}/${file}.htm`;

  let html: string;
  let retrievedAt: RetrievedAt;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(options?.skipCache
        ? { cache: 'no-store' as const }
        : { next: { revalidate: REVALIDATE_SECONDS } }),
    });
    if (!res.ok) {
      console.error(`[SWPA] ${file}.htm returned ${res.status}`);
      return null;
    }
    // Read from the headers, not the clock. Next replays cached headers along
    // with the cached body, so this stays pinned to the real fetch across the
    // revalidate window. See retrievedAtFrom().
    retrievedAt = retrievedAtFrom(res.headers);
    html = await res.text();
  } catch (e) {
    console.error(`[SWPA] ${file}.htm fetch failed`, e);
    return null;
  }

  const parsed = parseSchedulePage(html, retrievedAt);
  if (!parsed) {
    // Format change, or the page stopped being a schedule. Loud, because this
    // is the failure mode a scraper is most likely to hit and least likely to
    // notice on its own.
    console.error(`[SWPA] ${file}.htm did not parse as a schedule — format may have changed`);
    return null;
  }
  if (parsed.scheduleDate !== expected) {
    console.warn(
      `[SWPA] ${file}.htm covers ${parsed.scheduleDate}, expected ${expected} — dropping (not yet refreshed)`
    );
    return null;
  }
  return parsed;
}

/**
 * Codes SWPA spells more than one way for the same project, best first.
 *
 * Ozark L&D is printed `OZK` in the schedule's column header and `OZD` in the
 * project table on the same page — see the checked-in fixture, lines 6 and 52.
 * Schedules are keyed on the COLUMN, so a dam wired to the table's spelling
 * finds nothing and reports "no schedule" forever, which is indistinguishable
 * from a fetch failure. Trying both spellings makes the page's inconsistency
 * something this module absorbs rather than something a reader discovers.
 */
export const SWPA_CODE_ALIASES: Record<string, string[]> = {
  OZD: ['OZD', 'OZK'],
  OZK: ['OZK', 'OZD'],
};

/** Every spelling to try for a project code, preferred first. */
export function swpaCodeCandidates(projectCode: string): string[] {
  return SWPA_CODE_ALIASES[projectCode] ?? [projectCode];
}

/**
 * Schedules for one project across the next `days` days, today first.
 * Days that fail or haven't been refreshed are simply absent.
 */
export async function fetchProjectSchedule(
  projectCode: string,
  days = 3,
  options?: { skipCache?: boolean }
): Promise<ProjectSchedule[]> {
  const today = new Date();
  const wanted = Array.from({ length: Math.max(1, Math.min(days, 7)) }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const results = await Promise.allSettled(
    wanted.map((d) => fetchDaySchedule(d, options))
  );

  const codes = swpaCodeCandidates(projectCode);

  return results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .map((day) => {
      if (!day) return null;
      for (const code of codes) {
        const hit = day.projects[code];
        if (hit) return hit;
      }
      return null;
    })
    .filter((s): s is ProjectSchedule => s !== null);
}

/**
 * The contiguous idle stretches in a day's schedule, as hour-ending ranges.
 * This is the "best wading window" a tailwater angler is actually looking for,
 * and it rests only on the on/off pattern — the part of the schedule that
 * measured exact, rather than the ±10% cfs estimate.
 */
export function idleWindows(schedule: ProjectSchedule): Array<{ from: number; to: number }> {
  const windows: Array<{ from: number; to: number }> = [];
  let start: number | null = null;
  for (const h of schedule.hours) {
    if (h.megawatts === 0) {
      if (start === null) start = h.hourEnding;
    } else if (start !== null) {
      windows.push({ from: start, to: h.hourEnding - 1 });
      start = null;
    }
  }
  if (start !== null) windows.push({ from: start, to: 24 });
  return windows;
}
