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

import { getGeneralKnowledge, listKnowledgeGauges, listKnowledgeRiverSlugs, listKnowledgeSectionGauges } from '@/lib/eddy/knowledge';
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
  /**
   * Each active river's gauges as river_gauges links them, and what the
   * knowledge file says about gauges on that river. Optional so the other
   * rules can be exercised on their own.
   */
  gauges?: ReadonlyArray<KnowledgeGaugeInput>;
}

export interface KnowledgeGaugeInput {
  slug: string;
  /** Site ids linked to the river: usgs_site_id, or the provider's id. */
  linkedSiteIds: string[];
  /** The river's main gauge, or null when it has none. */
  primarySiteId: string | null;
  /** `### Gauge:` blocks in the file for this river. */
  fileGauges: ReadonlyArray<{ siteId: string; confirmed: boolean }>;
  /** Every `{@site}` tag on the river's reach notes. */
  reachTagSiteIds: string[];
}

/**
 * Pure. The knowledge file names gauges by site id, and nothing else makes the
 * file agree with river_gauges.
 *
 *  - A block or reach tag for a site the river is not linked to is never
 *    selected: it reads as covered and tells Eddy nothing.
 *  - Once a river has a confirmed gauge block, its Read is told where its own
 *    gauge sits only if the MAIN gauge has one. Without it the Read falls back
 *    to the river-wide block alone, which is how a spring got credited to a
 *    gauge that sits above it. A river with no confirmed blocks at all is not
 *    reported: that is the state every river started in.
 */
export function deriveKnowledgeGaugeFindings(gauges: ReadonlyArray<KnowledgeGaugeInput>): RawFinding[] {
  return gauges.flatMap((river) => {
    const linked = new Set(river.linkedSiteIds);
    const named = [...new Set([...river.fileGauges.map((g) => g.siteId), ...river.reachTagSiteIds])];
    const unlinked = named.filter((site) => !linked.has(site)).sort();
    const confirmed = river.fileGauges.filter((g) => g.confirmed).map((g) => g.siteId);
    const mainUncovered = confirmed.length > 0 && river.primarySiteId != null && !confirmed.includes(river.primarySiteId);
    if (!unlinked.length && !mainUncovered) return [];

    const problems = [
      unlinked.length ? `names ${unlinked.join(', ')}, which river_gauges does not link to this river` : null,
      mainUncovered ? `has confirmed gauge blocks but none for its main gauge ${river.primarySiteId}` : null,
    ].filter(Boolean);
    return [{
      entityType: 'river' as const,
      entityKey: river.slug,
      ruleKey: 'knowledge_gauge_mismatch',
      title: `${river.slug}: knowledge file and river_gauges disagree about gauges`,
      detail: `EDDY_KNOWLEDGE.md ${problems.join(', and ')}.`,
      evidence: { unlinked, primarySiteId: river.primarySiteId, confirmed },
    }];
  });
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
  return [
    ...deriveFileFindings(input),
    ...deriveRiverNoteFindings(input.riverNotes ?? []),
    ...deriveKnowledgeGaugeFindings(input.gauges ?? []),
  ];
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
      .select('slug, river_characteristics(river_note), river_gauges(is_primary, gauge_stations(usgs_site_id, site_id_external, active))')
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
        gauges: rows.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const links: any[] = (r.river_gauges ?? []).filter((link: any) => link.gauge_stations?.active !== false);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const siteOf = (link: any): string | null => link.gauge_stations?.usgs_site_id ?? link.gauge_stations?.site_id_external ?? null;
          return {
            slug: r.slug as string,
            linkedSiteIds: links.map(siteOf).filter((site): site is string => site != null),
            primarySiteId: siteOf(links.find((link) => link.is_primary) ?? {}),
            fileGauges: listKnowledgeGauges(r.slug).map((g) => ({ siteId: g.siteId, confirmed: g.confirmed })),
            reachTagSiteIds: Object.values(listKnowledgeSectionGauges(r.slug)).flat(),
          };
        }),
      }),
    };
  },
};
