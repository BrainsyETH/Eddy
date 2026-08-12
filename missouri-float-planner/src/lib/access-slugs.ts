// src/lib/access-slugs.ts
// Comparing the seed's access-point slugs against the database's.
//
// The logic behind `npm run db:check-access-slugs`, kept here so it is pure and
// testable: the script owns reading the file and running the SELECT, this owns
// deciding what disagrees. Nothing in the app imports it — it exists to be
// checked, and living in src/lib is what puts it under the web test suite.
//
// ── WHY IT EXISTS ──────────────────────────────────────────────────────────
//
// A data-correction migration keyed four UPDATEs on `access_points.slug`, the
// identity half of UNIQUE(river_id, slug). Two matched nothing: production
// calls those rows `mother-nature-s-riverfront-retreat` and
// `ha-ha-tonka-state-park`, the seed called them `mother-natures-retreat` and
// `ha-ha-tonka`. An UPDATE that matches nothing SUCCEEDS, so only an assertion
// in that migration caught it, and the audit that followed found nineteen
// drifted rows across six rivers rather than two.
//
// ── THE DATABASE WINS ──────────────────────────────────────────────────────
//
// The slug is a URL. `/rivers/<state>/<river>/access/<slug>` is linked and
// indexed, and `blog_posts.guide_data` addresses put-in and take-out by slug.
// So a live slug is not free to move and a seed that disagrees is the copy that
// is wrong. This never proposes renaming a database row.

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
   * `absent` — the database has no row of that name at all. A seed row for a
   * place production never had, or had under a name too different to match.
   * That needs a person, so it warns rather than fails.
   */
  kind: 'drift' | 'absent';
  river: string;
  seedSlug: string;
  name: string;
  dbSlug?: string;
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
  const bySlug = new Set(db.map((r) => `${r.river} ${r.slug}`));
  const byName = new Map<string, DbAccessRow[]>();
  for (const r of db) {
    const key = `${r.river} ${normalizeAccessName(r.name)}`;
    const list = byName.get(key);
    if (list) list.push(r);
    else byName.set(key, [r]);
  }

  const findings: SlugFinding[] = [];
  for (const s of seed) {
    if (bySlug.has(`${s.river} ${s.slug}`)) continue;
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
      findings.push({ kind: 'absent', river: s.river, seedSlug: s.slug, name: s.name });
    }
  }
  return findings;
}
