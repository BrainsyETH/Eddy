// scripts/lib/eddy-read-audit.ts
// The arithmetic behind scripts/audit-eddy-reads.ts, kept apart from the
// queries so it can be tested on fixed rows.
//
// These are the counts the 2026-11-16 review of Eddy's Read was built on. They
// were run by hand then, which made them findings somebody had to take on
// trust. This makes them a command.

import { riverNoteDefect } from '../../src/lib/eddy/river-note';

export interface AuditRiver {
  slug: string;
  riverNote: string | null;
  hasRainLag: boolean;
  hasPrimaryGauge: boolean;
}
export interface AuditSection { riverSlug: string; sectionSlug: string }
/** The newest stored eddy_updates row for one target. */
export interface AuditPublished { riverSlug: string; sectionSlug: string | null; modelUsed: string | null }
export interface AuditLogRow { outcome: string; reason: string | null; modelUsed: string | null; cacheReadTokens: number | null }

export interface AuditInput {
  rivers: AuditRiver[];
  sections: AuditSection[];
  published: AuditPublished[];
  /** River slug to its `###` subsection slugs in EDDY_KNOWLEDGE.md. */
  knowledgeSections: Record<string, string[]>;
  /** River slugs that have a `##` section in EDDY_KNOWLEDGE.md. */
  knowledgeRivers: string[];
  /** Null when eddy_generation_log does not exist yet. */
  log: AuditLogRow[] | null;
  logDays: number;
}

const key = (river: string, section: string) => `${river}/${section}`;
const share = (n: number, of: number) => (of ? `${n} of ${of} (${Math.round((n / of) * 100)}%)` : `${n} of ${of}`);
const list = (items: string[]) => (items.length ? items.join(', ') : 'none');

export function auditReport(input: AuditInput): string {
  const out: string[] = [];
  const riverSlugs = new Set(input.rivers.map((r) => r.slug));

  // ── what is being served ────────────────────────────────────────────
  const riverRows = input.published.filter((p) => p.sectionSlug == null && riverSlugs.has(p.riverSlug));
  const sectionRows = input.published.filter((p) => p.sectionSlug != null && riverSlugs.has(p.riverSlug));
  const modelRiver = riverRows.filter((p) => p.modelUsed);
  const modelSection = sectionRows.filter((p) => p.modelUsed);
  out.push('PUBLISHED READS (newest stored row per target)');
  out.push(`  Whole-river Reads written by the model: ${share(modelRiver.length, riverRows.length)}`);
  out.push(`    code-written: ${list(riverRows.filter((p) => !p.modelUsed).map((p) => p.riverSlug).sort())}`);
  out.push(`  Section Reads written by the model:     ${share(modelSection.length, sectionRows.length)}`);
  out.push(`    model-written: ${list(modelSection.map((p) => key(p.riverSlug, p.sectionSlug!)).sort())}`);
  const unpublished = input.rivers.map((r) => r.slug).filter((slug) => !riverRows.some((p) => p.riverSlug === slug)).sort();
  if (unpublished.length) out.push(`  Active rivers with no stored Read at all: ${list(unpublished)}`);

  // ── why, where the log can say ──────────────────────────────────────
  out.push('');
  if (input.log == null) {
    out.push('GENERATION LOG');
    out.push('  eddy_generation_log does not exist in this project (migration 20261117041752 not applied).');
    out.push('  Fallback causes, raw model output and prompts are not being kept.');
  } else {
    out.push(`GENERATION LOG (last ${input.logDays} days, ${input.log.length} attempts)`);
    const by = new Map<string, number>();
    for (const row of input.log) {
      const label = row.outcome === 'model' ? 'model' : `${row.outcome}: ${row.reason ?? 'unspecified'}`;
      by.set(label, (by.get(label) ?? 0) + 1);
    }
    for (const [label, n] of [...by].sort((a, b) => b[1] - a[1])) out.push(`  ${label.padEnd(32)} ${share(n, input.log.length)}`);
    const called = input.log.filter((row) => row.modelUsed);
    if (called.length) {
      out.push(`  Model calls that read the prompt cache: ${share(called.filter((row) => (row.cacheReadTokens ?? 0) > 0).length, called.length)}`);
    }
  }

  // ── what the knowledge file covers ──────────────────────────────────
  const dbSections = new Set(input.sections.map((s) => key(s.riverSlug, s.sectionSlug)));
  const fileSections = Object.entries(input.knowledgeSections)
    .flatMap(([river, slugs]) => slugs.map((slug) => key(river, slug)));
  const sectionsWithoutBlock = [...dbSections].filter((k) => !fileSections.includes(k)).sort();
  const blocksWithoutSection = fileSections.filter((k) => !dbSections.has(k)).sort();
  // A subsection reaches a Read only when its section's Read is model-written;
  // a code-written fallback is decided before knowledge is loaded.
  const reachable = fileSections.filter((k) => modelSection.some((p) => key(p.riverSlug, p.sectionSlug!) === k)).sort();
  out.push('');
  out.push('KNOWLEDGE FILE');
  out.push(`  Active rivers with no "## " section: ${list(input.rivers.map((r) => r.slug).filter((slug) => !input.knowledgeRivers.includes(slug)).sort())}`);
  out.push(`  Database sections with no "### " block: ${share(sectionsWithoutBlock.length, dbSections.size)}`);
  if (sectionsWithoutBlock.length) out.push(`    ${list(sectionsWithoutBlock)}`);
  out.push(`  "### " blocks matching no database section: ${list(blocksWithoutSection)}`);
  out.push(`  "### " blocks that can reach a section Read today: ${share(reachable.length, fileSections.length)}`);
  if (reachable.length) out.push(`    ${list(reachable)}`);

  // ── what the prompt is handed beside it ─────────────────────────────
  const malformed = input.rivers.filter((r) => riverNoteDefect(r.riverNote)).map((r) => r.slug).sort();
  const noNote = input.rivers.filter((r) => !r.riverNote?.trim()).map((r) => r.slug).sort();
  const noLag = input.rivers.filter((r) => !r.hasRainLag).map((r) => r.slug).sort();
  const noGauge = input.rivers.filter((r) => !r.hasPrimaryGauge).map((r) => r.slug).sort();
  out.push('');
  out.push(`PROMPT INPUTS (${input.rivers.length} active rivers)`);
  out.push(`  River note is ingest bookkeeping or unrendered: ${share(malformed.length, input.rivers.length)}`);
  if (malformed.length) out.push(`    ${list(malformed)}`);
  out.push(`  No river note at all: ${list(noNote)}`);
  out.push(`  No rain-to-river lag (database or legacy map): ${share(noLag.length, input.rivers.length)}`);
  if (noLag.length) out.push(`    ${list(noLag)}`);
  out.push(`  No primary gauge: ${list(noGauge)}`);

  return out.join('\n');
}
