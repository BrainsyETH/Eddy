// src/lib/trust/checks/eddy-knowledge.ts
// Every active river should have a "## <River>" section in EDDY_KNOWLEDGE.md,
// every gauge it reports from should have a confirmed block there, and the
// stored note Eddy is handed beside it should actually be a note.
//
// This is the check `npm run check:eddy-knowledge` already performs and CI never
// runs. The gap it covers is recorded in getKnowledgeForTarget()'s own warning
// (src/lib/eddy/knowledge.ts): Gasconade shipped without a section, so Eddy
// generated its prose from the General Ozarks primer alone and nobody noticed,
// because running on general knowledge produces confident text rather than an
// error.

import { getGeneralKnowledge, listKnowledgeGauges, listKnowledgeRiverSlugs, listKnowledgeSectionGauges } from '@/lib/eddy/knowledge';
import { riverNoteDefect } from '@/lib/eddy/river-note';
import { tailwaterReadDamId } from '@/lib/eddy/tailwater-river-read';
import { toNum } from '@/lib/utils/num';
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
  /**
   * The gauges a Read on this river can report from: the main gauge and every
   * gauge an approved put-in reads (reportingSites()). Optional so the tag
   * rule can be exercised on its own; omitted, the main gauge alone counts.
   */
  reportingSites?: ReadonlyArray<ReportingSite>;
  /** `### Gauge:` blocks in the file for this river. */
  fileGauges: ReadonlyArray<{ siteId: string; confirmed: boolean }>;
  /** Every `{@site}` tag on the river's reach notes. */
  reachTagSiteIds: string[];
}

/** A gauge a Read can report from, and why. */
export interface ReportingSite {
  siteId: string;
  main: boolean;
  /** Approved put-ins that read it, by stored mile or by map point. */
  putIns: number;
}

/**
 * Pure. The knowledge file names gauges by site id, and nothing else makes the
 * file agree with river_gauges.
 *
 * A block or reach tag for a site the river is not linked to is never
 * selected: it reads as covered and tells Eddy nothing.
 *
 * The other direction, a gauge the river reports from with no block, is
 * deriveReportingGaugeFindings(). It used to live here as "confirmed blocks
 * but none for the main gauge", which stayed quiet on a river with no
 * confirmed blocks at all. That is how the White was missed.
 */
export function deriveKnowledgeGaugeFindings(gauges: ReadonlyArray<KnowledgeGaugeInput>): RawFinding[] {
  return gauges.flatMap((river) => {
    const linked = new Set(river.linkedSiteIds);
    const named = [...new Set([...river.fileGauges.map((g) => g.siteId), ...river.reachTagSiteIds])];
    const unlinked = named.filter((site) => !linked.has(site)).sort();
    if (!unlinked.length) return [];
    return [{
      entityType: 'river' as const,
      entityKey: river.slug,
      ruleKey: 'knowledge_gauge_mismatch',
      title: `${river.slug}: knowledge file and river_gauges disagree about gauges`,
      detail: `EDDY_KNOWLEDGE.md names ${unlinked.join(', ')}, which river_gauges does not link to this river.`,
      evidence: { unlinked, primarySiteId: river.primarySiteId },
    }];
  });
}

// ── which gauge a put-in reads ─────────────────────────────────────
// A mirror of how get_river_condition_segment() chooses a gauge, as defined in
// supabase/migrations/20261117014151_flood_stage_resolves_station_first.sql.
// The check needs the gauge for every approved put-in on every active river,
// on both of the function's paths, and an RPC call for each is a thousand-odd
// round trips for a daily check. eddy-knowledge.test.ts fails when a later
// migration redefines the function, so the mirror gets re-read, not left to
// drift.

export interface PutInGaugeLink {
  stationId: string;
  /** usgs_site_id, or the provider's id. */
  siteId: string | null;
  isPrimary: boolean;
  /** river_gauges.river_mile. */
  riverMile: number | null;
  /** gauge_stations.active. */
  active: boolean;
  /** [lon, lat] of gauge_stations.location. */
  point: readonly [number, number] | null;
}

export interface PutInSection {
  gaugeStationId: string | null;
  start: number | null;
  end: number | null;
  sortOrder: number | null;
}

export interface PutIn {
  /** access_points.river_mile_downstream. */
  mile: number | null;
  /** [lon, lat] of the access point. */
  point: readonly [number, number] | null;
}

/** The first stretch, by sort_order, that names a gauge and holds this mile. */
function sectionGauge(mile: number | null, sections: ReadonlyArray<PutInSection>): string | null {
  if (mile == null) return null;
  return sections
    .filter((s) => s.gaugeStationId != null && (s.start == null || mile >= s.start) && (s.end == null || mile < s.end))
    .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))[0]?.gaugeStationId ?? null;
}

/** The function returns a gauge only when it is linked to the river and active. */
function linkedActive(stationId: string | null, links: ReadonlyArray<PutInGaugeLink>): PutInGaugeLink | null {
  return links.find((l) => l.stationId === stationId && l.active) ?? null;
}

/** The function's fallback: the lowest-mile gauge below the mile (any, with no mile), then the main gauge. */
function fallbackGauge(mile: number | null, links: ReadonlyArray<PutInGaugeLink>): string | null {
  const below = links
    .filter((l) => l.active && l.riverMile != null && (mile == null || l.riverMile > mile))
    .sort((a, b) => a.riverMile! - b.riverMile!)[0]?.stationId;
  return below ?? links.find((l) => l.isPrimary)?.stationId ?? null;
}

/**
 * Pure. The gauge a put-in reads given its stored mile, as the access page
 * and the planner ask: the stretch that holds the mile, else the nearest gauge
 * upstream by river_gauges.river_mile, else the nearest downstream, else the
 * main gauge.
 */
export function putInGaugeByMile(mile: number, links: ReadonlyArray<PutInGaugeLink>, sections: ReadonlyArray<PutInSection>): PutInGaugeLink | null {
  const upstream = links
    .filter((l) => l.active && l.riverMile != null && l.riverMile <= mile)
    .sort((a, b) => b.riverMile! - a.riverMile!)[0]?.stationId ?? null;
  return linkedActive(sectionGauge(mile, sections) ?? upstream ?? fallbackGauge(mile, links), links);
}

/**
 * Pure. The gauge a put-in reads given only its map point, as embeds and
 * /api/conditions ask: the stretch that holds the point's mile, else the
 * nearest active gauge by distance, whether or not its link carries a mile.
 *
 * One approximation: the function snaps the point to the river line for the
 * stretch test, and this uses the put-in's stored mile instead. The two agree
 * on most rivers; on the Bourbeuse and the St. Francis they differ by 22 to 34
 * miles (20261119184853). Where they differ this can count a gauge the
 * function would not choose. It cannot drop the main gauge, which counts on
 * its own.
 */
export function putInGaugeByPoint(put: PutIn, links: ReadonlyArray<PutInGaugeLink>, sections: ReadonlyArray<PutInSection>): PutInGaugeLink | null {
  const point = put.point;
  if (!point) return null;
  const nearest = links
    .filter((l) => l.active && l.point)
    .map((l) => ({ id: l.stationId, km: distanceKm(point, l.point!) }))
    .sort((a, b) => a.km - b.km)[0]?.id ?? null;
  return linkedActive(sectionGauge(put.mile, sections) ?? nearest ?? fallbackGauge(null, links), links);
}

function distanceKm([lon1, lat1]: readonly [number, number], [lon2, lat2]: readonly [number, number]): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Pure. The main gauge, then every gauge an approved put-in reads on either path, each once. */
export function reportingSites(
  links: ReadonlyArray<PutInGaugeLink>,
  sections: ReadonlyArray<PutInSection>,
  putIns: ReadonlyArray<PutIn>,
): ReportingSite[] {
  const sites = new Map<string, ReportingSite>();
  const main = links.find((l) => l.isPrimary && l.active);
  if (main?.siteId) sites.set(main.siteId, { siteId: main.siteId, main: true, putIns: 0 });
  for (const put of putIns) {
    const read = new Set(
      [put.mile != null ? putInGaugeByMile(put.mile, links, sections) : null, putInGaugeByPoint(put, links, sections)]
        .map((link) => link?.siteId)
        .filter((site): site is string => site != null),
    );
    for (const site of read) {
      const entry = sites.get(site) ?? { siteId: site, main: false, putIns: 0 };
      entry.putIns += 1;
      sites.set(site, entry);
    }
  }
  return [...sites.values()];
}

/**
 * Pure. A gauge a Read reports from that has no confirmed block in the file.
 *
 * Without one the Read is never told where its gauge sits, what joins above
 * and below it, or which water it speaks for. On 2026-11-17 that is how three
 * springs were credited to gauges above them. This does not wait for the river
 * to have other blocks: the White had none, and its put-ins read gauges either
 * side of the North Fork with nothing in the file to say which side.
 */
export function deriveReportingGaugeFindings(gauges: ReadonlyArray<KnowledgeGaugeInput>): RawFinding[] {
  return gauges.flatMap((river) => {
    const reporting = river.reportingSites
      ?? (river.primarySiteId ? [{ siteId: river.primarySiteId, main: true, putIns: 0 }] : []);
    const confirmed = new Set(river.fileGauges.filter((g) => g.confirmed).map((g) => g.siteId));
    const drafted = new Set(river.fileGauges.filter((g) => !g.confirmed).map((g) => g.siteId));
    // A tailwater-Read river's own release gauge (the dam's site id) is never
    // written about by a model: its river Read and its release tab are the
    // dam's code-written Read (ADR 0017 decisions 9 and 10), so no block is
    // read for it and its absence is not a gap.
    const damRead = tailwaterReadDamId(river.slug);
    const missing = reporting
      .filter((site) => !confirmed.has(site.siteId) && site.siteId !== damRead)
      .sort((a, b) => a.siteId.localeCompare(b.siteId));
    if (!missing.length) return [];

    const why = (site: ReportingSite) => [
      site.main ? 'the main gauge' : null,
      site.putIns ? `read by ${site.putIns} put-in${site.putIns === 1 ? '' : 's'}` : null,
      drafted.has(site.siteId) ? 'its block is still {unconfirmed}' : null,
    ].filter(Boolean).join(', ');
    return [{
      entityType: 'river' as const,
      entityKey: river.slug,
      ruleKey: 'knowledge_gauge_no_block',
      title: `${river.slug}: ${missing.length === 1 ? 'a gauge it reports from has' : `${missing.length} gauges it reports from have`} no gauge block`,
      detail: `EDDY_KNOWLEDGE.md has no confirmed "### Gauge:" block for ${missing.map((site) => `${site.siteId} (${why(site)})`).join('; ')}. A Read from that gauge is not told where it sits or which water it speaks for.`,
      evidence: {
        missing: missing.map((site) => ({ ...site, drafted: drafted.has(site.siteId) })),
        confirmed: [...confirmed].sort(),
      },
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
    ...deriveReportingGaugeFindings(input.gauges ?? []),
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

/** [lon, lat] of a GeoJSON point as PostgREST returns PostGIS columns, or null. */
function pointOf(value: unknown): [number, number] | null {
  const coords = (value as { type?: string; coordinates?: unknown } | null)?.coordinates;
  return Array.isArray(coords) && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) ? [coords[0], coords[1]] : null;
}

export const eddyKnowledgeCheck: TrustCheck = {
  id: 'eddy_knowledge',
  title: 'Eddy knowledge coverage',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase
      .from('rivers')
      .select(
        'slug, river_characteristics(river_note), ' +
          'river_gauges(is_primary, river_mile, gauge_stations(id, usgs_site_id, site_id_external, active, location)), ' +
          'river_sections(primary_gauge_station_id, river_mile_start, river_mile_end, sort_order), ' +
          'access_points(river_mile_downstream, location_snap)',
      )
      .eq('active', true)
      .eq('access_points.approved', true)
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
            reportingSites: reportingSites(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r.river_gauges ?? []).filter((link: any) => link.gauge_stations?.id).map((link: any) => ({
                stationId: link.gauge_stations.id as string,
                siteId: siteOf(link),
                isPrimary: link.is_primary === true,
                riverMile: toNum(link.river_mile),
                active: link.gauge_stations.active === true,
                point: pointOf(link.gauge_stations.location),
              })),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r.river_sections ?? []).map((s: any) => ({
                gaugeStationId: s.primary_gauge_station_id ?? null,
                start: toNum(s.river_mile_start),
                end: toNum(s.river_mile_end),
                sortOrder: toNum(s.sort_order),
              })),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r.access_points ?? []).map((ap: any) => ({ mile: toNum(ap.river_mile_downstream), point: pointOf(ap.location_snap) })),
            ),
            fileGauges: listKnowledgeGauges(r.slug).map((g) => ({ siteId: g.siteId, confirmed: g.confirmed })),
            reachTagSiteIds: Object.values(listKnowledgeSectionGauges(r.slug)).flat(),
          };
        }),
      }),
    };
  },
};
