#!/usr/bin/env npx tsx
/** Preview by default. --apply publishes the entire batch atomically or none. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../lib/db';
import { readinessProblems } from './readiness';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const slugs = [...new Set(args.filter(a => !a.startsWith('--')))];
  if (!slugs.length || args.some(a => a.startsWith('--') && !['--dry', '--apply'].includes(a)) || (apply && args.includes('--dry'))) {
    throw new Error('Usage: activate-rivers.ts <slug> [<slug> ...] [--dry | --apply] (default: preview)');
  }
  const readiness: Record<string, unknown> = {};
  for (const slug of slugs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid slug: ${slug}`);
    const dossier = JSON.parse(readFileSync(join(__dirname, 'dossiers', `${slug}.json`), 'utf8'));
    if (dossier.slug !== slug) throw new Error(`Dossier slug mismatch: ${slug}`);
    readiness[slug] = dossier.readiness;
    for (const problem of readinessProblems(dossier.readiness)) console.log(`${slug}: ${problem}`);
  }
  const db = getScriptClient({ script: 'activate-rivers', write: apply });
  // The database rechecks the evidence. Preview rolls back temporary visibility
  // inside a subtransaction, including when validation fails.
  const { data, error } = await db.rpc('review_river_activation', {
    p_slugs: slugs, p_readiness: readiness, p_apply: apply,
  });
  if (error) throw error;
  const found = (data ?? []) as { river_slug: string; check_name: string; severity: string; detail: string }[];
  for (const f of found) console.log(`${f.severity}: ${f.river_slug} / ${f.check_name}: ${f.detail}`);
  const blocked = found.some(f => f.severity === 'error');
  console.log(blocked ? 'Blocked. No river was activated.' : apply ? `Activated: ${slugs.join(', ')}` : 'Preview passed. No river was activated.');
  if (blocked) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
