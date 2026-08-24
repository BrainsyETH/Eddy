// scripts/service-quality.ts
// The directory's known debt, and the rule that stops it growing.
//
// ── WHY A RATCHET AND NOT A GATE ──────────────────────────────────────────
//
// 36 rows have no phone. 45 have no website. 62 have never been verified. A
// check that simply fails on those is red on the day it ships and red every
// day after, and a permanently red check is an ignored check — so it would
// protect nothing while looking like it protected everything.
//
// What is worth enforcing is the derivative. Existing debt is tolerated and
// named; NEW debt fails. That is a rule a corridor import can actually pass,
// and it gets strictly harder to violate as the backlog is paid down.
//
// ── WHY SLUGS AND NOT COUNTS ──────────────────────────────────────────────
//
// A count-based ratchet ("no more than 36 rows without a phone") is satisfied
// by fixing one row and breaking another. The baseline therefore records WHICH
// rows are in debt, so a swap reads as one regression and one improvement
// rather than as no change at all.
//
// The baseline is regenerated from the database by --update-baseline, never
// hand-edited, so it cannot drift from what is actually there. Its diff in a
// pull request is the visible record of debt paid down.
//
// ── WHY CLASSES CARRY A SEVERITY ──────────────────────────────────────────
//
// Not every defect deserves to stop a corridor landing. Three NPS-authorized
// Buffalo concessioners — Crockett's, Lost Valley Canoe, Buffalo River Canoes —
// were held out of the directory with confirmed phones, websites and offerings,
// because no geocoder would resolve a PO box suite, a road intersection, or an
// address two geocoders disagreed about by 1.4 miles. A row you can call is
// useful before it can be drawn, so refusing it made Eddy worse, not safer.
//
// So a class that makes the product WRONG fails: a campground that does not say
// it offers camping is a false claim about somewhere to sleep, a row with no
// phone and no website answers nothing, and a source that records nothing
// cannot be re-checked. A class that merely makes the product THINNER warns: a
// missing pin degrades the map, a missing description degrades a card, and
// neither tells anybody something untrue.

/** A directory row, reduced to the fields quality is judged on. */
export interface QualityRow {
  slug: string;
  name: string;
  type: string;
  status: string;
  phone: string | null;
  phone_toll_free: string | null;
  website: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  services_offered: string[] | null;
  last_verified_at: string | null;
  verified_source: string | null;
  /**
   * River membership, filled in by the audit after it reads service_rivers.
   * Undefined means "not measured" — the link read failed — rather than
   * "zero", so a transient read error cannot make every row look broken.
   */
  river_links?: number;
  primary_rivers?: number;
}

export type Severity = 'error' | 'warn';

export interface DebtClass {
  key: string;
  /** Printed when this class regresses. Says what is wrong, not what to run. */
  label: string;
  /** error = the row says something untrue or answers nothing. warn = thinner. */
  severity: Severity;
  applies: (row: QualityRow, today: Date) => boolean;
}

/** Sources that name no page anybody could open again. */
const PLACEHOLDER_SOURCES = new Set(['csv_import', 'unknown', 'n/a', '']);

const CAMPING_OFFERINGS = ['camping_primitive', 'camping_rv'];

/**
 * A verification date does not stay true. Businesses change hands, change
 * numbers and close — this branch found a motel that had shut, an outfitter
 * closed until March 2027, and three dead domains. A row verified once and
 * never again is a claim about the past wearing the badge of the present.
 *
 * Warn at six months, fail at a year. Seasonal and temporarily-closed rows get
 * a much shorter fuse, because "temporarily" is the part that expires: an
 * unconfirmed temporary closure is indistinguishable from a permanent one.
 */
export const STALE_WARN_DAYS = 180;
export const STALE_FAIL_DAYS = 365;
export const STALE_CLOSURE_DAYS = 120;

/** Days since the row was verified, or null if it never was. */
export function daysSinceVerified(row: QualityRow, today: Date): number | null {
  if (!row.last_verified_at) return null;
  const when = Date.parse(row.last_verified_at);
  if (Number.isNaN(when)) return null;
  return (today.getTime() - when) / 86_400_000;
}

export const DEBT_CLASSES: DebtClass[] = [
  {
    key: 'campground_without_camping',
    severity: 'error',
    label: 'a campground that does not say it offers camping',
    applies: (r) =>
      r.type === 'campground' &&
      !(r.services_offered ?? []).some((o) => CAMPING_OFFERINGS.includes(o)),
  },
  {
    key: 'no_contact',
    severity: 'error',
    label: 'no phone and no website — the row cannot answer "who do I call"',
    applies: (r) => !r.phone && !r.phone_toll_free && !r.website,
  },
  {
    key: 'no_coordinates',
    severity: 'warn',
    label: 'no coordinates — the row cannot be drawn on the map',
    // Both halves, because a pin needs both. Testing latitude alone let a row
    // with a latitude and no longitude past the ratchet entirely.
    applies: (r) =>
      r.latitude === null || r.latitude === undefined ||
      r.longitude === null || r.longitude === undefined,
  },
  {
    key: 'half_a_coordinate',
    severity: 'error',
    label: 'one half of a coordinate and not the other — the pair is incoherent',
    // Distinct from the class above on purpose. Having neither is a gap and
    // waits its turn; having exactly one is a contradiction in a row that has
    // been touched, and someone should look at it now.
    applies: (r) => {
      const lat = r.latitude !== null && r.latitude !== undefined;
      const lon = r.longitude !== null && r.longitude !== undefined;
      return lat !== lon;
    },
  },
  {
    key: 'no_primary_river',
    severity: 'error',
    label:
      'linked to a river but no link is primary — the row cannot say which ' +
      'river the business is mainly on',
    // Two statements set a primary, and until 20260824124650 the import could
    // run the first and not the second. Hand-written migrations can still do
    // it by omitting is_primary on insert, which is how the one row in this
    // class got here. The database has no constraint for it, so this is the
    // only thing that notices.
    applies: (r) =>
      r.river_links !== undefined && r.river_links > 0 && r.primary_rivers === 0,
  },
  {
    key: 'never_verified',
    severity: 'error',
    label: 'never verified — no date anybody checked it',
    applies: (r) => !r.last_verified_at,
  },
  {
    key: 'placeholder_source',
    severity: 'error',
    label: 'a source that records nothing, so the row cannot be re-checked',
    applies: (r) => PLACEHOLDER_SOURCES.has((r.verified_source ?? '').trim().toLowerCase()),
  },
  {
    key: 'thin_description',
    severity: 'warn',
    label: 'no usable description',
    applies: (r) => !r.description || r.description.trim().length < 20,
  },
  {
    key: 'verification_ageing',
    severity: 'warn',
    label: `last verified over ${STALE_WARN_DAYS} days ago`,
    applies: (r, today) => {
      const age = daysSinceVerified(r, today);
      return age !== null && age > STALE_WARN_DAYS && age <= STALE_FAIL_DAYS;
    },
  },
  {
    key: 'verification_expired',
    severity: 'error',
    label: `last verified over ${STALE_FAIL_DAYS} days ago — the row is a claim about a year ago`,
    applies: (r, today) => {
      const age = daysSinceVerified(r, today);
      return age !== null && age > STALE_FAIL_DAYS;
    },
  },
  {
    key: 'closure_ageing',
    severity: 'error',
    label:
      `recorded as seasonal or temporarily closed and not re-checked in ${STALE_CLOSURE_DAYS} days — ` +
      'a temporary state nobody has confirmed is a permanent claim',
    applies: (r, today) => {
      if (r.status !== 'seasonal' && r.status !== 'temporarily_closed') return false;
      const age = daysSinceVerified(r, today);
      return age === null || age > STALE_CLOSURE_DAYS;
    },
  },
];

export interface Baseline {
  generatedAt: string;
  /** Which Supabase project produced these numbers. */
  projectRef?: string;
  note: string;
  /** debt class key -> the slugs known to be in it */
  classes: Record<string, string[]>;
  /** river slug -> the service slugs recorded on it */
  riverMembers: Record<string, string[]>;
}

/**
 * A permanently closed business is not a data gap — it is a correctly recorded
 * fact — so it is excluded from every class.
 */
export function scorable(rows: QualityRow[]): QualityRow[] {
  return rows.filter((r) => r.status !== 'permanently_closed');
}

export function measureDebt(rows: QualityRow[], today = new Date()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const scored = scorable(rows);
  for (const cls of DEBT_CLASSES) {
    out[cls.key] = scored.filter((r) => cls.applies(r, today)).map((r) => r.slug).sort();
  }
  return out;
}

export interface Regression {
  classKey: string;
  label: string;
  severity: Severity;
  slugs: string[];
}

export interface RatchetResult {
  regressions: Regression[];
  improvements: Regression[];
  riverDrops: Array<{ river: string; lost: string[] }>;
  unknownRivers: string[];
}

/**
 * A baseline written before riverMembers existed carries riverFloors instead.
 * Reading it produced "Cannot convert undefined or null to object" from inside
 * a loop, which tells the reader nothing about what to do.
 */
export function baselineShapeProblem(baseline: Baseline): string | null {
  if (!baseline || typeof baseline !== 'object') return 'is missing or not an object';
  if (!baseline.classes) return 'has no `classes` — it was not written by buildBaseline';
  if (!baseline.riverMembers) {
    return 'predates river membership (it records `riverFloors`, a count). ' +
      'Re-record it with --update-baseline; the diff is the record of what changed.';
  }
  return null;
}

/**
 * Which Supabase project a set of numbers came from.
 *
 * A baseline recorded against a branch or a staging copy and then compared
 * against production reports every difference between the two databases as a
 * regression, which reads as "somebody broke the data" rather than "you are
 * looking at the wrong database".
 */
export function projectRefFromUrl(url: string | undefined): string {
  return (url ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\./)?.[1] ?? 'unknown';
}

/**
 * Whether it is safe to rewrite the baseline from this run's readings.
 *
 * `--update-baseline` is the one command that replaces the recorded truth, so
 * it is the one command that must not guess. A failed river read used to
 * arrive as a warning and an empty `perRiver`; rewriting from that wrote an
 * empty `riverMembers`, which silently disabled the coverage gate — no river
 * has members, so no river can lose one.
 */
export function baselineWriteProblem(
  perRiver: Record<string, string[]>,
  readError?: string | null,
): string | null {
  if (readError) {
    return `could not read river links (${readError}). ` +
      'An empty riverMembers would disable the coverage gate.';
  }
  if (Object.keys(perRiver).length === 0) {
    return 'no rivers were read, so riverMembers would be empty and the ' +
      'coverage gate would be disabled.';
  }
  return null;
}

export function compareToBaseline(
  current: Record<string, string[]>,
  currentPerRiver: Record<string, string[]>,
  baseline: Baseline,
): RatchetResult {
  const regressions: Regression[] = [];
  const improvements: Regression[] = [];

  for (const cls of DEBT_CLASSES) {
    const known = new Set(baseline.classes[cls.key] ?? []);
    const now = new Set(current[cls.key] ?? []);
    const added = [...now].filter((s) => !known.has(s)).sort();
    const fixed = [...known].filter((s) => !now.has(s)).sort();
    if (added.length > 0) {
      regressions.push({ classKey: cls.key, label: cls.label, severity: cls.severity, slugs: added });
    }
    if (fixed.length > 0) {
      improvements.push({ classKey: cls.key, label: cls.label, severity: cls.severity, slugs: fixed });
    }
  }

  // A river losing services is a regression too — an --overwrite run that
  // unlinks more than it meant to would otherwise pass every class above,
  // because the rows it detached are still perfectly good rows.
  //
  // Recorded as MEMBERSHIP and not as a count, for the same reason the debt
  // classes are: two services could swap rivers and leave every count
  // unchanged. A count-based floor calls that no change; this calls it two
  // departures, which is what it is.
  const riverDrops: Array<{ river: string; lost: string[] }> = [];
  for (const [river, members] of Object.entries(baseline.riverMembers ?? {})) {
    const now = new Set(currentPerRiver[river] ?? []);
    const lost = members.filter((slug) => !now.has(slug)).sort();
    if (lost.length > 0) riverDrops.push({ river, lost });
  }
  const unknownRivers = Object.keys(currentPerRiver)
    .filter((r) => !(r in (baseline.riverMembers ?? {})))
    .sort();

  return { regressions, improvements, riverDrops, unknownRivers };
}

export function buildBaseline(
  rows: QualityRow[],
  perRiver: Record<string, string[]>,
  generatedAt: string,
  today = new Date(),
): Baseline {
  return {
    generatedAt,
    note:
      'Regenerated by `npm run db:check-services -- --update-baseline`. Never ' +
      'hand-edited. Each list is the debt known on that date; a slug appearing ' +
      'that is not listed here is a NEW defect and fails the check. riverMembers ' +
      'records WHICH services each river carries, not how many — a count would ' +
      'let two services swap rivers and call it no change. A corridor pass adds ' +
      'names; nothing may drop one.',
    classes: measureDebt(rows, today),
    riverMembers: perRiver,
  };
}
