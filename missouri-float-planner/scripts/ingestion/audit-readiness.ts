#!/usr/bin/env npx tsx
/** Read-only production audit, including evidence that is stored in dossiers. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../lib/db';
import { readinessProblems } from './readiness';

async function main() {
  const db = getScriptClient({ script: 'audit-readiness', write: false });
  const slugs = process.argv.slice(2);
  if (slugs.some(s => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) throw new Error('Usage: audit-readiness.ts [slug ...]');
  const { data, error } = await db.rpc('audit_river_readiness', { p_slugs: slugs.length ? slugs : null });
  if (error) throw error;
  for (const finding of data ?? []) console.log(JSON.stringify(finding));
  const directory = join(__dirname, 'dossiers');
  for (const file of readdirSync(directory).filter(f => f.endsWith('.json'))) {
    const dossier = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    if (slugs.length && !slugs.includes(dossier.slug)) continue;
    const problems = readinessProblems(dossier.readiness);
    if (problems.length) console.log(`${dossier.slug}: readiness review outstanding: ${problems.join('; ')}`);
  }
  // Pending retrospective reviews are reported, not a retroactive delisting.
  if ((data ?? []).some((f: { severity: string }) => f.severity === 'error')) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
