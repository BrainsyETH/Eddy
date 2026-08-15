// src/lib/access-slugs.ts
// The access-point slug vocabulary: which slugs are canonical, which are the
// legacy spellings they replaced, and how to tell whether a copy has drifted.
//
// The logic lives here rather than in the script so it is pure and testable:
// `scripts/check-access-slugs.ts` owns reading the file and running the SELECT,
// this owns deciding what disagrees. Nothing in the app imports it — it exists
// to be checked, and living in src/lib is what puts it under the web suite.
//
// ── THE PRODUCTION SLUG IS THE CANONICAL ONE ───────────────────────────────
//
// A slug is a public identifier. `/rivers/<state>/<river>/access/<slug>` is
// linked and indexed, and `blog_posts.guide_data` addresses put-in and take-out
// by slug — every `from_slug` and `to_slug` in the live guide data resolves
// against production's spelling. So a live slug is not free to move, and when
// another copy disagrees it is that copy that is wrong. Nothing here ever
// proposes renaming a production row.
//
// ── WHAT WENT WRONG, AND WHY A LIST RATHER THAN A HABIT ────────────────────
//
// A data-correction migration keyed four UPDATEs on `access_points.slug`, the
// identity half of UNIQUE(river_id, slug). Two matched nothing: production
// called those rows `mother-nature-s-riverfront-retreat` and
// `ha-ha-tonka-state-park` while the seed called them `mother-natures-retreat`
// and `ha-ha-tonka`. An UPDATE whose WHERE matches nothing SUCCEEDS, so only an
// assertion inside that migration caught it, and the audit that followed found
// nineteen drifted rows across six rivers rather than two.

/** A slug production replaced, and what it answers to now. */
export interface AccessSlugRename {
  /** Part of the key throughout: `UNIQUE(river_id, slug)` is per river. */
  river: string;
  /** The spelling the old migrations and the pre-reconciliation seed used. */
  legacy: string;
  /** The spelling production serves, and the only one a URL may use. */
  canonical: string;
}

/**
 * The nineteen, verified against production read-only on 2026-08-15: every
 * `legacy` was absent there and every `canonical` present.
 *
 * Checked in rather than derived, because the derivation needs the database and
 * the migration that acts on it cannot have one at authoring time. This list is
 * the contract three artifacts agree on — the migration renames by it, the seed
 * is written in its canonical column, and the checker proves both.
 */
export const ACCESS_SLUG_RENAMES: readonly AccessSlugRename[] = [
  { river: 'meramec', legacy: 'scotia-bridge', canonical: 'scotia-bridge-access' },
  { river: 'meramec', legacy: 'onondaga-cave-sp', canonical: 'onondaga-cave-state-park' },
  { river: 'eleven-point', legacy: 'mcdowell', canonical: 'mcdowell-access' },
  { river: 'eleven-point', legacy: 'whitten', canonical: 'whitten-access' },
  { river: 'eleven-point', legacy: 'narrows', canonical: 'the-narrows-highway-142' },
  { river: 'eleven-point', legacy: 'myrtle', canonical: 'myrtle-access' },
  { river: 'jacks-fork', legacy: 'eminence', canonical: 'eminence-city-access' },
  { river: 'niangua', legacy: 'riverfront-campground', canonical: 'riverfront-campground-canoe' },
  {
    river: 'niangua',
    legacy: 'maggard-corkery',
    canonical: 'maggard-canoe-corkery-campground',
  },
  { river: 'niangua', legacy: 'big-bear-resort', canonical: 'big-bear-river-resort' },
  {
    river: 'niangua',
    legacy: 'barclay-access',
    canonical: 'barclay-conservation-area-access',
  },
  { river: 'niangua', legacy: 'mountain-creek-resort', canonical: 'mountain-creek-family-resort' },
  {
    river: 'niangua',
    legacy: 'mother-natures-retreat',
    canonical: 'mother-nature-s-riverfront-retreat',
  },
  { river: 'niangua', legacy: 'ha-ha-tonka', canonical: 'ha-ha-tonka-state-park' },
  { river: 'huzzah', legacy: 'hazel-creek', canonical: 'hazel-creek-recreation-area' },
  { river: 'huzzah', legacy: 'red-bluff', canonical: 'red-bluff-recreation-area' },
  { river: 'huzzah', legacy: 'butts-bridge', canonical: 'butts-low-water-bridge' },
  { river: 'huzzah', legacy: 'highway-8-lower', canonical: 'highway-8-bridge-lower' },
  { river: 'huzzah', legacy: 'huzzah-conservation', canonical: 'huzzah-conservation-area' },
];

/**
 * Seed rows production has under no name this can match, each left alone on
 * purpose.
 *
 * These are NOT drift. A drifted row is one the database holds under another
 * slug, which is a rename and can be applied mechanically. These eight have no
 * row of that NAME at all, so no rule can pair them — and the note beside each
 * is what a person would have to rule on. Six have a plausible production
 * neighbour and two have nothing resembling them.
 *
 * ── WHY THEY ARE LISTED RATHER THAN GUESSED ────────────────────────────────
 *
 * Deciding that "Bennett Spring State Park" and "Bennett Spring Access" are one
 * place is a judgement about the river, not about strings — and two seed rows
 * point at that one production row, so at least one of them is wrong in a way
 * only a person can settle. Guessing which of these is a rename and which is a
 * real absence is precisely the judgement that produced the nineteen above.
 *
 * The list is closed: the checker fails on any absent row NOT named here, so a
 * new unmatched row is an error rather than another line of prose.
 */
export interface AccessSlugException {
  river: string;
  seedSlug: string;
  /** What a person has to rule on. Never read as a proposed mapping. */
  note: string;
}

export const ACCESS_SLUG_ABSENT_EXCEPTIONS: readonly AccessSlugException[] = [
  { river: 'huzzah', seedSlug: 'highway-8-upper', note: 'cf. production highway-8-bridge-lower; no upper row exists' },
  { river: 'huzzah', seedSlug: 'meramec-confluence', note: 'no production row resembles it' },
  { river: 'niangua', seedSlug: 'bennett-spring', note: 'cf. production bennett-spring-access — two seed rows, one production row' },
  { river: 'niangua', seedSlug: 'bennett-spring-mdc', note: 'cf. production bennett-spring-access — the other of the two' },
  { river: 'niangua', seedSlug: 'lead-mine', note: 'cf. production lead-mine-access' },
  { river: 'niangua', seedSlug: 'nro-campground', note: 'cf. production niangua-river-oasis' },
  { river: 'niangua', seedSlug: 'tunnel-dam', note: 'cf. production tunnel-dam-boat-launch' },
  { river: 'niangua', seedSlug: 'riverbend-rv-park', note: 'no production row resembles it' },
];

export interface SeedAccessRow {
  river: string;
  slug: string;
  name: string;
}

export interface DbAccessRow {
  river: string;
  slug: string;
  name: string;
}

export interface SlugFinding {
  /**
   * `drift` — the database holds this place under a DIFFERENT slug. The seed
   * would build a database serving different URLs, and a migration keyed on the
   * seed's slug corrects nothing while reporting success. This is the failure.
   *
   * `absent` — the database has no row of that name at all. Allowed only for
   * the rows in ACCESS_SLUG_ABSENT_EXCEPTIONS; any other one fails, so that a
   * newly added seed row cannot quietly join the unresolved pile.
   */
  kind: 'drift' | 'absent';
  river: string;
  seedSlug: string;
  name: string;
  dbSlug?: string;
  /** Set on `absent` findings that the exception list accounts for. */
  excepted?: boolean;
}

/**
 * Pull (river, slug, name) out of each `INSERT INTO access_points` block.
 *
 * Deliberately a parse of the seed rather than a second hand-maintained list —
 * a list would be one more thing that can drift from the file it describes,
 * which is the bug this exists to catch.
 *
 * Every block has the same shape: the first two quoted literals after
 * `SELECT r.id,` are the name then the slug, and the river comes from the
 * closing `FROM rivers r WHERE r.slug = '...'`. Blocks that do not match are
 * counted rather than skipped quietly, so a parser that stops understanding the
 * file cannot turn the whole check into a green no-op.
 */
export function parseSeedAccessPoints(sql: string): {
  rows: SeedAccessRow[];
  unparsed: number;
} {
  const blocks = sql.split(/\bINSERT\s+INTO\s+access_points\b/i).slice(1);
  const rows: SeedAccessRow[] = [];
  let unparsed = 0;

  for (const block of blocks) {
    const river = /FROM\s+rivers\s+r\s+WHERE\s+r\.slug\s*=\s*'([^']+)'/i.exec(block);
    const quoted = [...block.matchAll(/'((?:[^']|'')*)'/g)];
    if (!river || quoted.length < 2) {
      unparsed += 1;
      continue;
    }
    rows.push({
      river: river[1],
      name: quoted[0][1].replace(/''/g, "'"),
      slug: quoted[1][1],
    });
  }
  return { rows, unparsed };
}

/** Loose enough that punctuation, case and doubled spaces cannot hide a match. */
export function normalizeAccessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const key = (river: string, slug: string) => `${river} ${slug}`;

/**
 * Every seed row whose slug the database does not have, classified by whether
 * the database knows the place under another slug.
 *
 * A seed row whose slug DOES match is never reported, even when the names
 * differ — the database is allowed to have retitled a place, and the URL is the
 * thing that has to hold.
 *
 * Rivers are part of the key throughout: `two-rivers` is a real access on both
 * the Current and the Jacks Fork, and `UNIQUE(river_id, slug)` says so.
 */
export function compareAccessSlugs(
  seed: readonly SeedAccessRow[],
  db: readonly DbAccessRow[],
): SlugFinding[] {
  const bySlug = new Set(db.map((r) => key(r.river, r.slug)));
  const byName = new Map<string, DbAccessRow[]>();
  for (const r of db) {
    const k = `${r.river} ${normalizeAccessName(r.name)}`;
    const list = byName.get(k);
    if (list) list.push(r);
    else byName.set(k, [r]);
  }
  const excepted = new Set(
    ACCESS_SLUG_ABSENT_EXCEPTIONS.map((e) => key(e.river, e.seedSlug)),
  );

  const findings: SlugFinding[] = [];
  for (const s of seed) {
    if (bySlug.has(key(s.river, s.slug))) continue;
    const matches = byName.get(`${s.river} ${normalizeAccessName(s.name)}`) ?? [];
    if (matches.length > 0) {
      // Every match, not the first: production carries genuine duplicates like
      // van-buren / van-buren-city-access, and picking one would hide half of it.
      for (const m of matches) {
        findings.push({
          kind: 'drift',
          river: s.river,
          seedSlug: s.slug,
          name: s.name,
          dbSlug: m.slug,
        });
      }
    } else {
      findings.push({
        kind: 'absent',
        river: s.river,
        seedSlug: s.slug,
        name: s.name,
        excepted: excepted.has(key(s.river, s.slug)),
      });
    }
  }
  return findings;
}

/**
 * What the seed itself must say, checkable with no database at all.
 *
 * This is the half of the contract CI can enforce: `db:check-access-slugs`
 * needs credentials and runs under `make check-db`, so without this a seed
 * reintroducing a legacy slug would reach main and only be caught by whoever
 * next ran a credentialled check.
 *
 * Three ways the file can be wrong:
 *  - it uses a slug the rename list calls legacy, so it would build URLs
 *    production does not serve (and a reset would need the migration to save
 *    it, which only works for databases that run the migration afterwards);
 *  - a mapping's canonical slug is nowhere in the file, so the rename list has
 *    an entry the seed does not honour and one of the two is stale;
 *  - an exception names a seed row that no longer exists, so the closed list of
 *    unresolved rows is quietly carrying a ghost.
 */
export function checkSeedAgainstRenames(seed: readonly SeedAccessRow[]): string[] {
  const problems: string[] = [];
  const seedSlugs = new Set(seed.map((r) => key(r.river, r.slug)));

  for (const rename of ACCESS_SLUG_RENAMES) {
    if (seedSlugs.has(key(rename.river, rename.legacy))) {
      problems.push(
        `${rename.river}/${rename.legacy} is the legacy spelling; the seed must use ${rename.canonical}`,
      );
    }
    if (!seedSlugs.has(key(rename.river, rename.canonical))) {
      problems.push(
        `${rename.river}/${rename.canonical} is in the rename list but not in the seed`,
      );
    }
  }

  for (const exception of ACCESS_SLUG_ABSENT_EXCEPTIONS) {
    if (!seedSlugs.has(key(exception.river, exception.seedSlug))) {
      problems.push(
        `${exception.river}/${exception.seedSlug} is listed as an unresolved row but is not in the seed`,
      );
    }
  }

  return problems;
}
