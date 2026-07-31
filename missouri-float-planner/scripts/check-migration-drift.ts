#!/usr/bin/env npx tsx

import { spawnSync } from 'node:child_process';

export interface MigrationStatus {
  local: string | null;
  remote: string | null;
}

// Eddy's legacy migrations were applied manually: the checkout used short,
// sometimes duplicated sequence numbers while production recorded unrelated
// timestamps. Treat that known split as a frozen baseline and enforce exact
// CLI history for every migration created after it.
export const LEGACY_LOCAL_THROUGH = '00212';
export const LEGACY_REMOTE_THROUGH = '20260729165052';

function cleanVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function migrationValue(item: Record<string, unknown>, key: 'local' | 'remote'): unknown {
  return item[key] ?? item[key[0].toUpperCase() + key.slice(1)];
}

function findMigrationRows(value: unknown): MigrationStatus[] | null {
  if (Array.isArray(value)) {
    const rows = value
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .filter((item) => 'local' in item || 'remote' in item || 'Local' in item || 'Remote' in item)
      .map((item) => ({
        local: cleanVersion(migrationValue(item, 'local')),
        remote: cleanVersion(migrationValue(item, 'remote')),
      }));

    if (rows.length > 0) return rows;

    for (const item of value) {
      const nested = findMigrationRows(item);
      if (nested) return nested;
    }
  } else if (value !== null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      const nested = findMigrationRows(nestedValue);
      if (nested) return nested;
    }
  }

  return null;
}

export function parseMigrationList(output: string): MigrationStatus[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Supabase CLI did not return valid JSON. Refusing to guess migration state.');
  }

  const rows = findMigrationRows(parsed);
  if (!rows) {
    throw new Error('Supabase CLI JSON did not contain migration rows. Refusing to guess migration state.');
  }

  return rows;
}

export function findMigrationDrift(rows: MigrationStatus[]): MigrationStatus[] {
  return rows.filter(({ local, remote }) => {
    if (local === remote) return false;
    if (local && !remote && /^\d{5}$/.test(local) && local <= LEGACY_LOCAL_THROUGH) return false;
    if (remote && !local && /^\d{14}$/.test(remote) && remote <= LEGACY_REMOTE_THROUGH) return false;
    return true;
  });
}

export function parseCliError(output: string): string | null {
  try {
    const parsed = JSON.parse(output) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message : null;
  } catch {
    return null;
  }
}

function formatVersion(version: string | null): string {
  return version ?? '—';
}

function main() {
  const result = spawnSync(
    'supabase',
    ['migration', 'list', '--linked', '--output-format', 'json'],
    { encoding: 'utf8' }
  );

  if (result.error) {
    console.error('Migration drift check could not start the pinned Supabase CLI.');
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('Migration drift check could not read the linked Supabase project.');
    console.error(parseCliError(result.stdout) || result.stderr.trim() || result.stdout.trim());
    console.error('\nLink this checkout once with: npx supabase link --project-ref <project-ref>');
    process.exit(1);
  }

  let rows: MigrationStatus[];
  try {
    rows = parseMigrationList(result.stdout);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const drift = findMigrationDrift(rows);
  if (drift.length > 0) {
    console.error('Local and production migration histories differ:');
    console.error('');
    console.error('Local\tRemote');
    for (const row of drift) {
      console.error(`${formatVersion(row.local)}\t${formatVersion(row.remote)}`);
    }
    console.error('\nResolve the difference before releasing. Use `supabase db push --dry-run` before applying local migrations.');
    process.exit(1);
  }

  console.log(`Migration histories match (${rows.length} migrations).`);
}

if (process.argv[1]?.endsWith('check-migration-drift.ts')) {
  main();
}
