// src/lib/trust/checks/eddy-knowledge.ts
// Every active river should have a "## <River>" section in EDDY_KNOWLEDGE.md,
// and the stored note Eddy is handed beside it should actually be a note.
//
// This is the check `npm run check:eddy-knowledge` already performs and CI never
// runs. The gap it covers is recorded in getKnowledgeForTarget()'s own warning
// (src/lib/eddy/knowledge.ts): Gasconade shipped without a section, so Eddy
// generated its prose from the General Ozarks primer alone and nobody noticed,
// because running on general knowledge produces confident text rather than an
// error.

import { getGeneralKnowledge, listKnowledgeRiverSlugs } from '@/lib/eddy/knowledge';
import { riverNoteDefect } from '@/lib/eddy/river-note';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface KnowledgeCoverageInput {
  activeRiverSlugs: string[];
  knowledgeSlugs: string[];
  generalKnowledge: string;
  /**
   * Each active river's stored river_characteristics.river_note, as stored.
   * Optional so the knowledge-file rules can be exercised on their own.
   */
  riverNotes?: ReadonlyArray<{ slug: string; note: string | null }>;
}

/**
 * Pure. A stored river note that is ingest bookkeeping or an unrendered
 * template, which the Read prompt would otherwise present as "Gauge notes:".
 *
 * Independent of the knowledge file on purpose: a deployment that lost
 * EDDY_KNOWLEDGE.md still has these, and they are a separate thing to fix.
 */
export function deriveRiverNoteFindings(
  riverNotes: ReadonlyArray<{ slug: string; note: string | null }>,
): RawFinding[] {
  return riverNotes.flatMap(({ slug, note }) => {
    const defect = riverNoteDefect(note);
    if (!defect) return [];
    return [{
      entityType: 'river' as const,
      entityKey: slug,
      ruleKey: 'river_note_malformed',
      title: `${slug}: river note is not a note`,
      detail:
        defect === 'ingestion_placeholder'
          ? 'river_characteristics.river_note holds the dossier ingest\'s "Per-section hydro types" bookkeeping string. The loader ignores it, so Eddy has no gauge note for this river.'
          : 'river_characteristics.river_note contains an unrendered value (undefined, null, NaN or [object Object]). The loader ignores it, so Eddy has no gauge note for this river.',
      // A short excerpt only: the full string lists every section slug.
      evidence: { defect, excerpt: (note ?? '').slice(0, 120) },
    }];
  });
}

/**
 * Pure.
 *
 * The missing-file case is separated deliberately. parseKnowledgeFile() swallows
 * a read failure and returns empty sections with a console warning, so a
 * deployment that lost the file looks identical to one whose knowledge file
 * covers nothing — except that the first should raise one finding and the second
 * should raise one per river. Filing thirteen per-river findings for a single
 * missing file would bury the actual cause under its own symptoms.
 */
export function deriveKnowledgeFindings(input: KnowledgeCoverageInput): RawFinding[] {
  return [...deriveFileFindings(input), ...deriveRiverNoteFindings(input.riverNotes ?? [])];
}

function deriveFileFindings(input: KnowledgeCoverageInput): RawFinding[] {
  const fileLooksAbsent =
    input.knowledgeSlugs.length === 0 && input.generalKnowledge.trim().length === 0;

  if (fileLooksAbsent) {
    return [
      {
        entityType: 'repo',
        entityKey: 'EDDY_KNOWLEDGE.md',
        ruleKey: 'knowledge_file_missing',
        title: 'EDDY_KNOWLEDGE.md is missing or empty',
        detail:
          'No General block and no river sections parsed. Eddy generates prose from general knowledge only when this file is absent, which produces confident text rather than an error.',
      },
    ];
  }

  const covered = new Set(input.knowledgeSlugs);
  return input.activeRiverSlugs
    .filter((slug) => !covered.has(slug))
    .map((slug) => ({
      entityType: 'river' as const,
      entityKey: slug,
      ruleKey: 'knowledge_missing_section',
      title: `${slug}: no section in EDDY_KNOWLEDGE.md`,
      detail: `Active river "${slug}" has no "## " section, so Eddy writes about it from the General Ozarks primer alone.`,
      evidence: { knowledgeSectionCount: input.knowledgeSlugs.length },
    }));
}

export const eddyKnowledgeCheck: TrustCheck = {
  id: 'eddy_knowledge',
  title: 'Eddy knowledge coverage',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase
      .from('rivers')
      .select('slug, river_characteristics(river_note)')
      .eq('active', true)
      .order('slug');

    if (error) {
      throw new Error(`Failed to load active rivers: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? [];
    const activeRiverSlugs: string[] = rows.map((r) => r.slug);
    // One-to-one in the schema, but PostgREST returns either shape depending
    // on how it infers the relationship (rivers/context.ts handles both too).
    const riverNotes = rows.map((r) => {
      const rc = Array.isArray(r.river_characteristics) ? r.river_characteristics[0] : r.river_characteristics;
      return { slug: r.slug as string, note: (rc?.river_note ?? null) as string | null };
    });

    return {
      scopeCount: activeRiverSlugs.length,
      findings: deriveKnowledgeFindings({
        activeRiverSlugs,
        knowledgeSlugs: listKnowledgeRiverSlugs(),
        generalKnowledge: getGeneralKnowledge(),
        riverNotes,
      }),
    };
  },
};
