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
 * Usage:
 *   npm run db:check-access-slugs              (exit 1 on drift)
 *   npm run db:check-access-slugs -- --strict  (exit 1 on absent rows too)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
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
  const strict = process.argv.includes('--strict');

  const { rows: seed, unparsed } = parseSeedAccessPoints(readFileSync(SEED_PATH, 'utf8'));
  console.log(`\nSeed access points parsed: ${seed.length}`);
  if (unparsed > 0) {
    console.log(`  ! ${unparsed} INSERT block(s) did not match the expected shape`);
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

  if (drift.length === 0) {
    console.log('  ✓ every seed slug matches the database');
  } else {
    console.log('Seed slug is not the database slug — the seed builds different URLs:');
    for (const f of drift) {
      console.log(`  ✗ ${f.river.padEnd(14)} ${f.seedSlug.padEnd(30)} → ${f.dbSlug}   "${f.name}"`);
    }
  }

  if (absent.length > 0) {
    console.log('\nSeed rows with no database row of that name (a person has to rule on these):');
    for (const f of absent) {
      console.log(`  ? ${f.river.padEnd(14)} ${f.seedSlug.padEnd(30)} "${f.name}"`);
    }
  }

  console.log(`\n${drift.length ? '✗' : '✓'} ${drift.length} drifted, ${absent.length} absent\n`);
  if (drift.length > 0 || (strict && absent.length > 0)) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
