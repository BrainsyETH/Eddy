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
  /** Who runs the site, from the closed vocabulary. Private, or NULL if nobody
   *  has established it — see the column comment on nearby_services. */
  managing_agency?: string | null;
  /**
   * Other rows this one shares a phone number with, once the shared-contact
   * check has ruled out switchboards and tier splits. Undefined means "not
   * measured", empty means "measured and clean".
   */
  shares_contact_with?: string[];
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
    key: 'shared_contact',
    severity: 'error',
    label:
      'shares a phone number with another row that is not an agency ' +
      'switchboard — the same business is probably filed twice',
    applies: (r) => (r.shares_contact_with?.length ?? 0) > 0,
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

/**
 * Who may run a site, for nearby_services.
 *
 * ── THIS IS NOT @eddy/types ManagingAgency, AND THAT IS A KNOWN PROBLEM ────
 *
 * access_points.managing_agency has its own vocabulary — MDC, NPS, USFS, COE,
 * State Park, County, Municipal, Private — with a CHECK constraint since
 * 00034 and a shipped `ManagingAgency` union. The two disagree: COE vs USACE
 * for one agency, `State Park` vs a per-state spelling, and each has a value
 * the other lacks. That split predates this file (the directory already held
 * `MO State Parks` and `USFS` before any of this work) and unifying it means
 * touching 274 access points, the map sheet and an iOS type — separate work,
 * deliberately not done here. What IS fixed here is that the directory's own
 * vocabulary is now closed rather than aspirational.
 */
export const MANAGING_AGENCIES = [
  'NPS', 'USFS', 'USACE', 'MO State Parks', 'AR State Parks',
  'MDC', 'AGFC', 'County', 'Private',
] as const;

export type ManagingAgencyValue = (typeof MANAGING_AGENCIES)[number];

export function isKnownAgency(value: string | null | undefined): boolean {
  return MANAGING_AGENCIES.includes((value ?? '') as ManagingAgencyValue);
}

/**
 * Whether this value says an AGENCY runs the site — the question that decides
 * whether a shared phone number is a switchboard or a duplicate.
 *
 * Deliberately false for anything unrecognised, and that is the whole point.
 * The obvious reading — "not null and not Private, so an agency runs it" —
 * fails OPEN: a typo like `Privte` is neither, so the group is treated as an
 * agency switchboard and the duplicate warning is suppressed silently, for
 * every row on that number, with no symptom anybody would ever notice. An
 * unknown value therefore counts as private, which at worst asks somebody to
 * confirm a pair that is fine.
 */
export function agencyRuns(value: string | null | undefined): boolean {
  return isKnownAgency(value) && value !== 'Private';
}

/** A row reduced to what the shared-contact check needs. */
export interface ContactRow {
  slug: string;
  type: string;
  status: string;
  phone?: string | null;
  phone_toll_free?: string | null;
  managing_agency?: string | null;
}

export interface SharedContact {
  digits: string;
  slugs: string[];
}

/** Digits only, so 417-284-3290 and (417) 284-3290 are one number. */
export function phoneDigits(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

/**
 * Rows that share a phone number and are probably the same business twice.
 *
 * ── WHY THIS IS NOT JUST "SAME PHONE" ─────────────────────────────────────
 *
 * Sharing a number is usually correct. Six ONSR campgrounds sit on one
 * concessioner line; Redding and Wolf Pen share an Ozark-St. Francis district
 * line; St. Francois and Washington share 877-I-CAMP-MO. Flagging those would
 * make the check noise, and noise is how a check gets ignored.
 *
 * ── WHY NOT NAME SIMILARITY ───────────────────────────────────────────────
 *
 * Tried and rejected against real data. nameScore at the importer's 0.86
 * threshold scores Dawt Mill / Dawt Mill Resort and Montauk State Park /
 * Montauk State Park Campground at 1.000 — the two pairs that are CORRECT,
 * one facility deliberately filed under two types so it reaches both the
 * lodging and camping tiers. It scores the one real duplicate,
 * Pettit's Canoe & Campground / Pettit's Canoe Rental, at 0.788, below the
 * highest-scoring switchboard pair (Alley Spring / Big Spring, 0.810). Name
 * similarity ranks this exactly backwards.
 *
 * What does separate them is who runs the place and what tier it is in:
 *
 *   · any row in the group run by an agency → a switchboard, not a duplicate.
 *   · more than one `type` in the group → the deliberate tier split.
 *   · otherwise → two private rows of the same kind on one number. Look.
 *
 * Verified against production 2026-08-24: six shared-number groups, all six
 * correctly skipped, and the sole flag was the duplicate that 20260824171732
 * collapsed.
 *
 * A NULL managing_agency counts as private, so a column nobody has filled in
 * yet makes this check MORE eager rather than silently blind — and so does a
 * value outside the vocabulary; see agencyRuns for why a typo must never read
 * as an agency. A column that was never SELECTED is a different thing and must
 * not be mistaken for either: the first run of this check omitted
 * managing_agency from the query and reported all six switchboards as
 * duplicates, because absent read as private. So absence of the key is a
 * programming error and says so, rather than quietly producing ten findings
 * that are all wrong.
 */
export function sharedContacts(rows: ContactRow[]): SharedContact[] {
  const groups = new Map<string, ContactRow[]>();
  for (const row of rows) {
    if (row.status === 'permanently_closed') continue;
    const digits = phoneDigits(row.phone) ?? phoneDigits(row.phone_toll_free);
    if (!digits) continue;
    if (!('managing_agency' in row)) {
      throw new Error(
        `sharedContacts: ${row.slug} carries no managing_agency key — add the ` +
        'column to the select. Treating it as private would report every ' +
        'agency switchboard as a duplicate.',
      );
    }
    groups.set(digits, [...(groups.get(digits) ?? []), row]);
  }

  const flagged: SharedContact[] = [];
  for (const [digits, members] of groups) {
    if (members.length < 2) continue;
    const agencyRun = members.some((m) => agencyRuns(m.managing_agency));
    if (agencyRun) continue;
    if (new Set(members.map((m) => m.type)).size > 1) continue;
    flagged.push({ digits, slugs: members.map((m) => m.slug).sort() });
  }
  return flagged.sort((a, b) => a.digits.localeCompare(b.digits));
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
