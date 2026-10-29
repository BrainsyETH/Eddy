#!/usr/bin/env npx tsx
/**
 * Download: npx tsx scripts/ingestion/import-agency-gis.ts --download <directory>
 * Preview:  npx tsx scripts/ingestion/import-agency-gis.ts --from <directory>
 * Import:   EXPECTED_SUPABASE_REF=... npx tsx scripts/ingestion/import-agency-gis.ts --from <directory> --apply
 *
 * Ingests source evidence only. Never creates/approves/moves public access points.
 * Reviewed source-to-place links and access candidates are a separate deliberate
 * transaction, documented alongside the snapshot. Partial downloads never write.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../lib/db';
import { AGENCY_SOURCES, downloadAgencySnapshot, normalizeAgencySnapshot, type AgencySnapshot } from './agency-gis';

async function main() {
  const args = process.argv.slice(2);
  const download = args.indexOf('--download');
  const from = args.indexOf('--from');
  const apply = args.includes('--apply');
  if ((download >= 0) === (from >= 0) || (download >= 0 && apply)) {
    throw new Error('Use --download <directory> OR --from <directory> [--apply]');
  }
  const directory = args[(download >= 0 ? download : from) + 1];
  if (!directory || directory.startsWith('--')) throw new Error('Missing snapshot directory');
  const allowed = new Set([download >= 0 ? '--download' : '--from', directory, ...(apply ? ['--apply'] : [])]);
  if (args.some((arg) => !allowed.has(arg))) throw new Error('Unknown argument');
  const providers = ['mdc', 'agfc'] as const;
  if (download >= 0) {
    const snapshots: AgencySnapshot[] = [];
    for (const provider of providers) {
      const url = `${AGENCY_SOURCES[provider].url}/query`;
      snapshots.push(await downloadAgencySnapshot(provider, async (params) => {
        const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}`);
        return response.json();
      }));
    }
    mkdirSync(directory, { recursive: true });
    for (const snapshot of snapshots) {
      writeFileSync(join(directory, `${snapshot.source}-features.json`), JSON.stringify(snapshot, null, 2) + '\n');
      console.log(`${snapshot.source}: downloaded all ${snapshot.count} records`);
    }
    return;
  }
  // Validate both complete snapshots before constructing a write client.
  const rows = providers.flatMap((provider) => {
    const snapshot = JSON.parse(readFileSync(join(directory, `${provider}-features.json`), 'utf8')) as AgencySnapshot;
    if (snapshot.source !== provider) throw new Error('Snapshot filename/provider mismatch');
    const records = normalizeAgencySnapshot(snapshot);
    console.log(`${provider}: ${records.length} source records; fetched ${snapshot.retrieved_at}`);
    return records;
  });
  if (!apply) {
    console.log(`Preview: ${rows.length} source records; no public places or review state will change.`);
    return;
  }
  const db = getScriptClient({ script: 'import-agency-gis', write: true });
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200);
    const { data, error } = await db.from('agency_gis_features')
      .upsert(batch, { onConflict: 'provider,source_id' }).select('provider,source_id');
    if (error) throw error;
    if (data?.length !== batch.length) throw new Error('Incomplete source import response');
  }
  console.log(`Imported ${rows.length} source records. Existing place links and public access points preserved.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
