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
  services_offered: string[] | null;
  last_verified_at: string | null;
  verified_source: string | null;
}

export interface DebtClass {
  key: string;
  /** Printed when this class regresses. Says what is wrong, not what to run. */
  label: string;
  applies: (row: QualityRow) => boolean;
}

/** Sources that name no page anybody could open again. */
const PLACEHOLDER_SOURCES = new Set(['csv_import', 'unknown', 'n/a', '']);

const CAMPING_OFFERINGS = ['camping_primitive', 'camping_rv'];

export const DEBT_CLASSES: DebtClass[] = [
  {
    key: 'campground_without_camping',
    label: 'a campground that does not say it offers camping',
    applies: (r) =>
      r.type === 'campground' &&
      !(r.services_offered ?? []).some((o) => CAMPING_OFFERINGS.includes(o)),
  },
  {
    key: 'no_contact',
    label: 'no phone and no website — the row cannot answer "who do I call"',
    applies: (r) => !r.phone && !r.phone_toll_free && !r.website,
  },
  {
    key: 'no_coordinates',
    label: 'no coordinates — the row cannot be drawn on the map',
    applies: (r) => r.latitude === null || r.latitude === undefined,
  },
  {
    key: 'never_verified',
    label: 'never verified — no date anybody checked it',
    applies: (r) => !r.last_verified_at,
  },
  {
    key: 'placeholder_source',
    label: 'a source that records nothing, so the row cannot be re-checked',
    applies: (r) => PLACEHOLDER_SOURCES.has((r.verified_source ?? '').trim().toLowerCase()),
  },
  {
    key: 'thin_description',
    label: 'no usable description',
    applies: (r) => !r.description || r.description.trim().length < 20,
  },
];

export interface Baseline {
  generatedAt: string;
  note: string;
  /** debt class key -> the slugs known to be in it */
  classes: Record<string, string[]>;
  /** river slug -> service count it must not fall below */
  riverFloors: Record<string, number>;
}

/**
 * A permanently closed business is not a data gap — it is a correctly recorded
 * fact — so it is excluded from every class.
 */
export function scorable(rows: QualityRow[]): QualityRow[] {
  return rows.filter((r) => r.status !== 'permanently_closed');
}

export function measureDebt(rows: QualityRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const scored = scorable(rows);
  for (const cls of DEBT_CLASSES) {
    out[cls.key] = scored.filter(cls.applies).map((r) => r.slug).sort();
  }
  return out;
}

export interface Regression {
  classKey: string;
  label: string;
  slugs: string[];
}

export interface RatchetResult {
  regressions: Regression[];
  improvements: Regression[];
  riverDrops: Array<{ river: string; floor: number; now: number }>;
  unknownRivers: string[];
}

export function compareToBaseline(
  current: Record<string, string[]>,
  currentPerRiver: Record<string, number>,
  baseline: Baseline,
): RatchetResult {
  const regressions: Regression[] = [];
  const improvements: Regression[] = [];

  for (const cls of DEBT_CLASSES) {
    const known = new Set(baseline.classes[cls.key] ?? []);
    const now = new Set(current[cls.key] ?? []);
    const added = [...now].filter((s) => !known.has(s)).sort();
    const fixed = [...known].filter((s) => !now.has(s)).sort();
    if (added.length > 0) regressions.push({ classKey: cls.key, label: cls.label, slugs: added });
    if (fixed.length > 0) improvements.push({ classKey: cls.key, label: cls.label, slugs: fixed });
  }

  // A river losing services is a regression too — an --overwrite run that
  // unlinks more than it meant to would otherwise pass every class above.
  const riverDrops: Array<{ river: string; floor: number; now: number }> = [];
  for (const [river, floor] of Object.entries(baseline.riverFloors)) {
    const now = currentPerRiver[river] ?? 0;
    if (now < floor) riverDrops.push({ river, floor, now });
  }
  const unknownRivers = Object.keys(currentPerRiver)
    .filter((r) => !(r in baseline.riverFloors))
    .sort();

  return { regressions, improvements, riverDrops, unknownRivers };
}

export function buildBaseline(
  rows: QualityRow[],
  perRiver: Record<string, number>,
  generatedAt: string,
): Baseline {
  return {
    generatedAt,
    note:
      'Regenerated by `npm run db:check-services -- --update-baseline`. Never ' +
      'hand-edited. Each list is the debt known on that date; a slug appearing ' +
      'that is not listed here is a NEW defect and fails the check. riverFloors ' +
      'is the service count each river must not fall below — a corridor pass ' +
      'raises it, nothing may lower it.',
    classes: measureDebt(rows),
    riverFloors: perRiver,
  };
}
