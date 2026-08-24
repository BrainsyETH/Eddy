#!/usr/bin/env npx tsx
/**
 * River-specific facts for a business that serves more than one river.
 *
 * ── WHY THIS IS A SEPARATE FILE AND A SEPARATE CSV ────────────────────────
 *
 * `nearby_services.services_offered` belongs to the business. `service_rivers`
 * only recorded membership. Between them they quietly assert that every rental
 * and shuttle a business lists applies on every river it is linked to, and this
 * directory has plenty of counter-examples:
 *
 *   Bass' River Resort   6-, 7- and 13-mile Courtois runs between Berryman,
 *                        Blunts, Bass' and Scotia. Its Meramec trips are
 *                        different water entirely.
 *   Ozark Outdoors       a 10-mile Butts Slab run and a SEASONAL 5-mile
 *                        "Courtois Primitive" — seasonal on the Courtois and
 *                        not on the Meramec, which one seasonal_notes on the
 *                        business cannot say.
 *   BSC Outdoors         3-, 5- and 8-mile floats on the Gasconade AND the
 *                        Big Piney, which is the case where the facts really
 *                        are the same and nothing needs recording.
 *
 * The facts key on (service, river), so they live in their own CSV rather than
 * being crammed into the pipe-separated river_slugs column of the services
 * import. A row here never creates a link: it decorates one that exists, and
 * refuses if it does not, because inventing the link is how a business ends up
 * advertised on water it does not run.
 *
 * CSV: service_slug, river_slug, services_offered, routes, seasonal_notes,
 *      verified_source, source_checked_at
 *
 *   services_offered  pipe-separated, same vocabulary as the services import.
 *                     Empty means "no river-specific claim" and readers fall
 *                     back to the business's own list.
 *   routes            `Name,miles,put-in,take-out[,seasonal]` per route,
 *                     separated by `|`.
 *
 * Usage:
 *   npx tsx scripts/import-service-river-facts.ts <csv>            # validate
 *   npx tsx scripts/import-service-river-facts.ts <csv> --import   # write
 */

import * as fs from 'fs';
import * as path from 'path';
import { getScriptClient } from './lib/db';
import { checkedAtProblem, parseCsv, resolveOfferings, sourceProblem } from './import-services-csv';

export interface RiverRoute {
  name: string;
  miles: number | null;
  putIn: string | null;
  takeOut: string | null;
  seasonal: boolean;
}

/** `Name,miles,put-in,take-out[,seasonal]` — miles may be a range like 20-25. */
export function parseRoutes(raw: string): { routes: RiverRoute[]; errors: string[] } {
  const routes: RiverRoute[] = [];
  const errors: string[] = [];
  for (const chunk of raw.split('|').map((x) => x.trim()).filter(Boolean)) {
    const parts = chunk.split(',').map((x) => x.trim());
    if (parts.length < 2) {
      errors.push(`route "${chunk}" needs at least a name and a distance`);
      continue;
    }
    const [name, milesRaw, putIn, takeOut, seasonalRaw] = parts;
    if (!name) { errors.push(`route "${chunk}" has no name`); continue; }
    // A range keeps its lower bound: a 20-25 mile trip is at least 20, and a
    // reader deciding whether they have the day for it wants the floor.
    const milesText = (milesRaw ?? '').split('-')[0];
    const miles = milesText === '' ? null : Number(milesText);
    if (miles !== null && !Number.isFinite(miles)) {
      errors.push(`route "${name}" has a distance that is not a number: "${milesRaw}"`);
      continue;
    }
    if (seasonalRaw && !['seasonal', 'year-round'].includes(seasonalRaw)) {
      errors.push(`route "${name}" fifth field must be seasonal or year-round, got "${seasonalRaw}"`);
      continue;
    }
    routes.push({
      name,
      miles,
      putIn: putIn || null,
      takeOut: takeOut || null,
      seasonal: seasonalRaw === 'seasonal',
    });
  }
  return { routes, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const shouldImport = args.includes('--import');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npx tsx scripts/import-service-river-facts.ts <csv> [--import]');
    process.exit(1);
  }
  const csvPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(csvPath)) { console.error(`File not found: ${csvPath}`); process.exit(1); }

  console.log('🔗 Service ↔ river facts');
  console.log('='.repeat(70));
  console.log(`Mode: ${shouldImport ? 'IMPORT' : 'VALIDATE (no writes)'}`);

  const matrix = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
  const headers = matrix[0].map((h) => h.trim());
  for (const req of ['service_slug', 'river_slug', 'verified_source', 'source_checked_at']) {
    if (!headers.includes(req)) { console.error(`Missing required header: ${req}`); process.exit(1); }
  }

  const supabase = getScriptClient({ script: 'import-service-river-facts', write: shouldImport });
  const { data: services, error: svcErr } = await supabase.from('nearby_services').select('id, slug');
  if (svcErr) throw new Error(`Could not read nearby_services: ${svcErr.message}`);
  const { data: rivers, error: rivErr } = await supabase.from('rivers').select('id, slug');
  if (rivErr) throw new Error(`Could not read rivers: ${rivErr.message}`);
  const { data: links, error: linkErr } = await supabase.from('service_rivers').select('id, service_id, river_id');
  if (linkErr) throw new Error(`Could not read service_rivers: ${linkErr.message}`);

  const svcBySlug = new Map((services ?? []).map((x: { id: string; slug: string }) => [x.slug, x.id]));
  const rivBySlug = new Map((rivers ?? []).map((x: { id: string; slug: string }) => [x.slug, x.id]));
  const linkKey = new Map(
    (links ?? []).map((l: { id: string; service_id: string; river_id: string }) =>
      [`${l.service_id}|${l.river_id}`, l.id]),
  );

  const errors: string[] = [];
  const updates: Array<{ id: string; label: string; patch: Record<string, unknown> }> = [];

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];
    if (values.length === 1 && values[0].trim() === '') continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });
    const label = `${row.service_slug} ↔ ${row.river_slug}`;
    const at = (m: string) => errors.push(`line ${i + 1} (${label}): ${m}`);

    const serviceId = svcBySlug.get(row.service_slug);
    const riverId = rivBySlug.get(row.river_slug);
    if (!serviceId) { at('no such service'); continue; }
    if (!riverId) { at('no such river'); continue; }
    // Decorating a link, never creating one. Advertising a business on water it
    // does not run is the failure this refuses to enable.
    const id = linkKey.get(`${serviceId}|${riverId}`);
    if (!id) { at('these two are not linked — link them in the services import first'); continue; }

    const sourceIssue = sourceProblem(row.verified_source);
    if (sourceIssue) at(`verified_source ${sourceIssue}`);
    const dateIssue = checkedAtProblem(row.source_checked_at);
    if (dateIssue) at(`source_checked_at ${dateIssue}`);

    const patch: Record<string, unknown> = {
      verified_source: row.verified_source,
      checked_at: row.source_checked_at,
    };
    if (row.services_offered) {
      const { offerings, errors: offErrors } = resolveOfferings(
        row.services_offered.split('|').map((x) => x.trim()).filter(Boolean),
      );
      for (const m of offErrors) at(m);
      patch.services_offered = offerings;
    }
    if (row.routes) {
      const { routes, errors: routeErrors } = parseRoutes(row.routes);
      for (const m of routeErrors) at(m);
      patch.routes = routes;
    }
    if (row.seasonal_notes) patch.seasonal_notes = row.seasonal_notes;

    updates.push({ id, label, patch });
  }

  console.log('\nProposed');
  console.log('-'.repeat(70));
  for (const u of updates) {
    console.log(`  ${u.label}`);
    for (const [k, v] of Object.entries(u.patch)) {
      console.log(`      ${k.padEnd(18)} ${Array.isArray(v) ? JSON.stringify(v) : String(v)}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} problem(s) — nothing written.`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\n${updates.length} link(s) validated.`);
  if (!shouldImport) { console.log('\n💡 Validation only. Re-run with --import to write.'); return; }

  for (const u of updates) {
    const { error } = await supabase.from('service_rivers').update(u.patch).eq('id', u.id);
    if (error) { console.error(`  ❌ ${u.label}: ${error.message}`); process.exit(1); }
  }
  console.log(`\n✅ ${updates.length} link(s) updated.`);
}

if (path.basename(process.argv[1] ?? '').replace(/\.[cm]?[tj]s$/, '') === 'import-service-river-facts') {
  main().catch((e) => { console.error(e); process.exit(1); });
}
