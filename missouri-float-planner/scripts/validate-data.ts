#!/usr/bin/env npx tsx
/**
 * Data validation suite — the automated QA gate for river data.
 *
 * Runs the SQL checks in validate_river_data() (migration 00146):
 *   threshold ordering, gauge coverage/liveness, required multi-region
 *   fields, provider site ids, access-point snap distance, mileage sanity
 * plus filesystem checks the database can't see:
 *   EDDY_KNOWLEDGE.md coverage vs the active river roster.
 *
 * Usage:
 *   npm run db:validate            (exit 1 on errors, 0 on warnings-only)
 *   npm run db:validate -- --strict  (exit 1 on warnings too)
 *
 * Run before flipping a new river to active = true, and periodically in CI.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

interface Finding {
  river_slug: string;
  check_name: string;
  severity: 'error' | 'warning';
  detail: string;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }
  return createClient(url, serviceKey);
}

/** Rivers with a ## section in EDDY_KNOWLEDGE.md (catches roster drift). */
function knowledgeCoverageFindings(activeRivers: Array<{ slug: string; name: string }>): Finding[] {
  const findings: Finding[] = [];
  const knowledgePath = path.join(__dirname, '..', 'EDDY_KNOWLEDGE.md');

  if (!fs.existsSync(knowledgePath)) {
    return [{
      river_slug: '(all)',
      check_name: 'knowledge_file_missing',
      severity: 'error',
      detail: `EDDY_KNOWLEDGE.md not found at ${knowledgePath}`,
    }];
  }

  const content = fs.readFileSync(knowledgePath, 'utf-8').toLowerCase();
  for (const river of activeRivers) {
    // Section headers are river names, e.g. "## Current River"
    const nameToken = river.name.toLowerCase().replace(/\s+(river|creek)$/,'');
    const hasSection = content.split('\n').some(
      (line) => line.startsWith('## ') && line.includes(nameToken)
    );
    if (!hasSection) {
      findings.push({
        river_slug: river.slug,
        check_name: 'knowledge_missing_section',
        severity: 'warning',
        detail: `no ## section for "${river.name}" in EDDY_KNOWLEDGE.md — chat/updates have no local knowledge`,
      });
    }
  }
  return findings;
}

async function main() {
  const strict = process.argv.includes('--strict');
  const supabase = getSupabaseClient();

  console.log('🔍 Eddy data validation');
  console.log('='.repeat(60));

  // 1. SQL checks
  const { data: sqlFindings, error } = await supabase.rpc('validate_river_data');
  if (error) {
    console.error('validate_river_data() RPC failed (has migration 00146 run?):', error.message);
    process.exit(1);
  }

  // 2. Filesystem checks
  const { data: activeRivers, error: riversError } = await supabase
    .from('rivers')
    .select('slug, name')
    .eq('active', true);
  if (riversError) {
    console.error('Failed to load active rivers:', riversError.message);
    process.exit(1);
  }

  const findings: Finding[] = [
    ...((sqlFindings ?? []) as Finding[]),
    ...knowledgeCoverageFindings(activeRivers ?? []),
  ];

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  for (const f of errors) {
    console.log(`  ❌ [${f.river_slug}] ${f.check_name}: ${f.detail}`);
  }
  for (const f of warnings) {
    console.log(`  ⚠️  [${f.river_slug}] ${f.check_name}: ${f.detail}`);
  }

  console.log('='.repeat(60));
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s) across ${activeRivers?.length ?? 0} active rivers`);

  if (errors.length > 0 || (strict && warnings.length > 0)) {
    process.exit(1);
  }
  console.log('  ✅ Validation passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
