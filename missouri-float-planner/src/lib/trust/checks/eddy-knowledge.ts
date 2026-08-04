// src/lib/trust/checks/eddy-knowledge.ts
// Every active river should have a "## <River>" section in EDDY_KNOWLEDGE.md.
//
// This is the check `npm run check:eddy-knowledge` already performs and CI never
// runs. The gap it covers is recorded in getKnowledgeForTarget()'s own warning
// (src/lib/eddy/knowledge.ts): Gasconade shipped without a section, so Eddy
// generated its prose from the General Ozarks primer alone and nobody noticed,
// because running on general knowledge produces confident text rather than an
// error.

import { getGeneralKnowledge, listKnowledgeRiverSlugs } from '@/lib/eddy/knowledge';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface KnowledgeCoverageInput {
  activeRiverSlugs: string[];
  knowledgeSlugs: string[];
  generalKnowledge: string;
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
      .select('slug')
      .eq('active', true)
      .order('slug');

    if (error) {
      throw new Error(`Failed to load active rivers: ${error.message}`);
    }

    const activeRiverSlugs: string[] = (data ?? []).map((r: { slug: string }) => r.slug);

    return {
      scopeCount: activeRiverSlugs.length,
      findings: deriveKnowledgeFindings({
        activeRiverSlugs,
        knowledgeSlugs: listKnowledgeRiverSlugs(),
        generalKnowledge: getGeneralKnowledge(),
      }),
    };
  },
};
