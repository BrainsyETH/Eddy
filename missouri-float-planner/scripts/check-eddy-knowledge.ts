#!/usr/bin/env npx tsx
/**
 * check-eddy-knowledge.ts — guards EDDY_KNOWLEDGE.md.
 *
 *  1. General-section integrity: the parsed General block must contain BOTH the
 *     hydrology/safety primer AND the nearest-towns content. Regression test for
 *     the flushBuffer bug where the "### Nearest Towns" subsection clobbered the
 *     whole General primer (src/lib/eddy/knowledge.ts).
 *  2. Onboarding gate: every ACTIVE river must have a "## <River>" section, so
 *     no river ships knowledge-less (as Gasconade did). Needs Supabase creds;
 *     degrades to a skip (with a warning) when they are absent, so a CI run
 *     without DB access still exercises the file checks.
 *
 * Usage: npx tsx scripts/check-eddy-knowledge.ts   (or: npm run check:eddy-knowledge)
 * Exits non-zero on any failure.
 */

import { listKnowledgeRiverSlugs, getGeneralKnowledge } from '../src/lib/eddy/knowledge';

(async () => {
  let failed = false;
  const fail = (msg: string) => {
    console.error(`  ❌ ${msg}`);
    failed = true;
  };

  // (1) General-section integrity. "strainer" and the spring-fed primer appear
  // only in the main General text, never in the nearest-towns block — so their
  // presence proves the primer survived parsing.
  const general = getGeneralKnowledge();
  if (!/strainer/i.test(general) || !/spring[- ]?fed|spring input/i.test(general)) {
    fail('General knowledge is missing the hydrology/safety primer — the parser may be dropping it (see knowledge.ts flushBuffer).');
  }
  if (!/nearest town|food, fuel/i.test(general)) {
    fail('General knowledge is missing the nearest-towns content.');
  }

  // (2) Active-river knowledge gate (DB-dependent; skip when no creds).
  const known = new Set(listKnowledgeRiverSlugs());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(url, key);
    const { data, error } = await db.from('rivers').select('slug').eq('active', true);
    if (error) {
      fail(`could not read active rivers: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (!known.has(r.slug)) fail(`active river "${r.slug}" has no "## " section in EDDY_KNOWLEDGE.md`);
      }
      console.log(`  ✓ ${data?.length ?? 0} active rivers checked against ${known.size} knowledge sections`);
    }
  } else {
    console.warn('  ⚠️  SUPABASE creds not set — skipping the active-river cross-check (file checks still ran).');
  }

  if (failed) {
    console.error('\n❌ EDDY_KNOWLEDGE.md check failed.');
    process.exit(1);
  }
  console.log('✅ EDDY_KNOWLEDGE.md check passed.');
})().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
