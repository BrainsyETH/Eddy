#!/usr/bin/env npx tsx
/**
 * The seed's access-point slugs, audited against the live database.
 *
 * The comparison itself lives in src/lib/access-slugs.ts, with the reasoning
 * for it and its unit tests; this is the file reading and the SELECT around it.
 *
 * ── READ ONLY ──────────────────────────────────────────────────────────────
 * No writes, ever. This is a check, and it runs against production data.
 *
 * ── WHAT FAILS ─────────────────────────────────────────────────────────────
 *   drift    the database holds the place under another slug — the seed would
 *            build different URLs, and a migration keyed on its slug would
 *            correct nothing while reporting success. Always fails.
 *   absent   no row of that name at all. Fails UNLESS the row is one of the
 *            eight in ACCESS_SLUG_ABSENT_EXCEPTIONS, so that a newly added seed
 *            row cannot quietly join the unresolved pile.
 *   seed     the file contradicts the checked-in rename list — a legacy slug is
 *            back, a canonical one is missing, or an exception names a row that
 *            no longer exists. Needs no database, so it runs first.
 *
 * Usage:
 *   npm run db:check-access-slugs
 *   npm run db:check-access-slugs -- --seed-only   (no credentials needed)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  ACCESS_SLUG_ABSENT_EXCEPTIONS,
  checkSeedAgainstRenames,
  compareAccessSlugs,
  parseSeedAccessPoints,
  type DbAccessRow,
} from '../src/lib/access-slugs';

const SEED_PATH = join(__dirname, '..', 'supabase', 'seed', 'access_points.sql');

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).',
    );
  }
  return createClient(url, serviceKey);
}

async function main() {
  const seedOnly = process.argv.includes('--seed-only');

  const { rows: seed, unparsed } = parseSeedAccessPoints(readFileSync(SEED_PATH, 'utf8'));
  console.log(`\nSeed access points parsed: ${seed.length}`);
  if (unparsed > 0) {
    console.log(`  ! ${unparsed} INSERT block(s) did not match the expected shape`);
  }

  const seedProblems = checkSeedAgainstRenames(seed);
  if (seedProblems.length > 0) {
    console.log('\nThe seed contradicts the checked-in rename list:');
    for (const p of seedProblems) console.log(`  ✗ ${p}`);
  } else {
    console.log('  ✓ seed agrees with the rename list');
  }

  if (seedOnly) {
    console.log(`\n${seedProblems.length ? '✗' : '✓'} seed check only — the database was not read\n`);
    process.exit(seedProblems.length > 0 ? 1 : 0);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('access_points')
    .select('slug, name, rivers!inner(slug)');
  if (error) throw new Error(`Could not read access_points: ${error.message}`);

  const db: DbAccessRow[] = (data ?? []).map((row) => {
    const r = row as unknown as { slug: string; name: string; rivers: { slug: string } };
    return { river: r.rivers.slug, slug: r.slug, name: r.name };
  });
  console.log(`Database access points:    ${db.length}\n`);

  const findings = compareAccessSlugs(seed, db);
  const drift = findings.filter((f) => f.kind === 'drift');
  const absent = findings.filter((f) => f.kind === 'absent');
  const unexpected = absent.filter((f) => !f.excepted);
  const known = absent.filter((f) => f.excepted);

  if (drift.length === 0) {
    console.log('  ✓ every seed slug matches the database');
  } else {
    console.log('Seed slug is not the database slug — the seed builds different URLs:');
    for (const f of drift) {
      console.log(`  ✗ ${f.river.padEnd(14)} ${f.seedSlug.padEnd(34)} → ${f.dbSlug}   "${f.name}"`);
    }
  }

  if (unexpected.length > 0) {
    console.log('\nSeed rows with no database row of that name, and no exception on file:');
    for (const f of unexpected) {
      console.log(`  ✗ ${f.river.padEnd(14)} ${f.seedSlug.padEnd(34)} "${f.name}"`);
    }
    console.log(
      '\n  Add it to the database, correct the seed, or — if it is genuinely\n' +
        '  unresolved — record it in ACCESS_SLUG_ABSENT_EXCEPTIONS with what a\n' +
        '  person would have to check. Do not guess a mapping for it.',
    );
  }

  if (known.length > 0) {
    console.log(`\nKnown unresolved rows (${known.length}, on file, awaiting a person):`);
    for (const f of known) {
      const note = ACCESS_SLUG_ABSENT_EXCEPTIONS.find(
        (e) => e.river === f.river && e.seedSlug === f.seedSlug,
      )?.note;
      console.log(`  · ${f.river.padEnd(14)} ${f.seedSlug.padEnd(34)} ${note ?? ''}`);
    }
  }

  const failed = seedProblems.length + drift.length + unexpected.length;
  console.log(
    `\n${failed ? '✗' : '✓'} ${drift.length} drifted, ${unexpected.length} unexplained absent, ` +
      `${known.length} known absent, ${seedProblems.length} seed problem(s)\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
