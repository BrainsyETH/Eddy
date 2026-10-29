#!/usr/bin/env npx tsx
/**
 * npx tsx scripts/ingestion/build-agency-enrichment-sql.ts <snapshot-dir> [--write]
 *
 * Validates <snapshot-dir>/enrichment.json and prints a summary. --write regenerates
 * <snapshot-dir>/apply-enrichment.sql and adds its openly licensed photos to
 * src/data/reviewed-place-photos.json. Neither step touches a database: the SQL is
 * executed separately, only against the explicitly confirmed Eddy project.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enrichmentSql, imageUrlsOf, reviewedPhotoEntries, validateEnrichment, type EnrichmentSite } from './agency-enrichment';

const [directory, ...flags] = process.argv.slice(2);
if (!directory || flags.some((f) => f !== '--write')) {
  throw new Error('Usage: build-agency-enrichment-sql.ts <snapshot-dir> [--write]');
}
const sites = validateEnrichment(JSON.parse(readFileSync(join(directory, 'enrichment.json'), 'utf8')).sites as EnrichmentSite[]);
console.table(sites.map((s) => ({
  slug: s.slug, pin: s.pin ? 'moved' : 'agency', photos: imageUrlsOf(s).length,
  decision: s.decision ? `${s.decision.approve ? 'approve' : 'hold'}${s.decision.is_float_endpoint ? ' + endpoint' : ''}` : 'pending',
})));
if (flags.includes('--write')) {
  writeFileSync(join(directory, 'apply-enrichment.sql'), enrichmentSql(sites));
  const catalogPath = join(__dirname, '../../src/data/reviewed-place-photos.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { id: string; image: { url: string } }[];
  const fresh = reviewedPhotoEntries(sites).filter((e) => !catalog.some((c) => c.id === e.id && c.image.url === e.image.url));
  writeFileSync(catalogPath, JSON.stringify([...catalog, ...fresh], null, 2) + '\n');
  console.log(`Wrote apply-enrichment.sql; added ${fresh.length} reviewed photo credit(s).`);
}
