// src/lib/trust/checks/float-summary.ts
// rivers.float_summary is prose about the float ladder. It is authored by hand
// and stored separately from the ladder it describes, so nothing has ever made
// the two agree.
//
// They drifted. Migration 00177 recalibrated the cfs danger lines, calling out
// "flood-flow-anchored danger lines that UNDER-warn: North Fork (8,440 cfs on a
// river locals call high at ~1,000), James (4,410 vs observed flood onset
// 3,000)". It fixed river_gauges and left the prose alone, so for months the
// North Fork page rated a reading "High Water" from a 2,200 cfs danger line
// while the paragraph under it said danger began near 8,440 — four times the
// real number, on the reassuring side.
//
// The ladder always wins in the product: it computes the badge. Prose that
// disagrees cannot change the rating, only talk a reader out of believing it.
// That is the whole failure mode, and these three rules are the mechanical part
// of it — the part that does not need an editor to notice.

import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface FloatSummaryRow {
  riverSlug: string;
  floatSummary: string | null;
  /** river_gauges.threshold_unit for the PRIMARY gauge: 'cfs' or 'ft'. */
  thresholdUnit: string | null;
  levelDangerous: number | null;
  /** gauge_stations.name for the primary gauge, e.g. "Big River near Richwoods, MO". */
  primaryGaugeName: string | null;
}

/** Measurements written in the given unit: "519–1013 cfs", "~8,440 cfs", "2.0–3.5 ft". */
function measurementsIn(prose: string, unit: 'cfs' | 'ft'): number[] {
  const unitPattern = unit === 'cfs' ? 'cfs' : '(?:ft|feet)';
  // A number, optionally a range partner, then the unit. Both sides of a range
  // count — "519–1013 cfs" states two levels, not one.
  const re = new RegExp(
    String.raw`~?(\d[\d,]*(?:\.\d+)?)\s*(?:[–\-—]\s*~?(\d[\d,]*(?:\.\d+)?)\s*)?${unitPattern}\b`,
    'gi',
  );
  const out: number[] = [];
  for (const m of prose.matchAll(re)) {
    for (const raw of [m[1], m[2]]) {
      if (raw == null) continue;
      const n = Number(raw.replace(/,/g, ''));
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

/**
 * Pure.
 *
 * Deliberately conservative — each rule fires only on evidence that cannot be a
 * turn of phrase:
 *
 *  - `summary_unit_mismatch`: a number carrying the OTHER unit than the ladder.
 *    Not any mention of feet — "rose three feet" is fine — but "2.5–3.0 ft is
 *    ideal" on a gauge Eddy reads in cfs, which is what the Jacks Fork said.
 *  - `summary_above_danger`: a level stated in the ladder's own unit, higher
 *    than level_dangerous. Prose has no business describing water past the
 *    danger line as anything, so this is always either a stale threshold or an
 *    under-warning. Equality passes: naming the danger line is the point.
 *  - `summary_gauge_mismatch`: the station the prose calls "(primary)" is not
 *    the primary. Only checked when the prose uses the explicit
 *    "<name> gauge (primary)" form; other phrasings fail open rather than
 *    guess, because a false accusation here is worse than a miss.
 */
export function deriveFloatSummaryFindings(rows: FloatSummaryRow[]): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const row of rows) {
    const prose = row.floatSummary?.trim();
    if (!prose) continue; // No prose is not a defect; plenty of rivers have none.

    const unit = row.thresholdUnit === 'cfs' || row.thresholdUnit === 'ft' ? row.thresholdUnit : null;

    if (unit) {
      const wrongUnit = unit === 'cfs' ? 'ft' : 'cfs';
      const strays = measurementsIn(prose, wrongUnit);
      if (strays.length > 0) {
        findings.push({
          entityType: 'river',
          entityKey: row.riverSlug,
          ruleKey: 'summary_unit_mismatch',
          title: `${row.riverSlug}: float summary quotes ${wrongUnit}, ladder is ${unit}`,
          detail:
            `The float summary states levels in ${wrongUnit} (${strays.join(', ')}) but the primary gauge's ` +
            `ladder is in ${unit}. A reader comparing the live reading to the prose is comparing two different scales.`,
          evidence: { thresholdUnit: unit, quotedUnit: wrongUnit, quoted: strays },
        });
      }

      if (row.levelDangerous != null) {
        const over = measurementsIn(prose, unit).filter((n) => n > Number(row.levelDangerous));
        if (over.length > 0) {
          findings.push({
            entityType: 'river',
            entityKey: row.riverSlug,
            ruleKey: 'summary_above_danger',
            title: `${row.riverSlug}: float summary names levels above the danger line`,
            detail:
              `The float summary cites ${over.join(', ')} ${unit}, above level_dangerous ` +
              `(${row.levelDangerous} ${unit}). Prose that puts the danger line higher than the ladder does ` +
              `under-warns: the badge says dangerous while the paragraph implies headroom.`,
            evidence: { levelDangerous: Number(row.levelDangerous), quotedAbove: over, unit },
          });
        }
      }
    }

    const claimed = prose.match(/\b(?:at|on)\s+the\s+(.+?)\s+gauge\s*\(primary\)/i)?.[1];
    if (claimed && row.primaryGaugeName) {
      const station = row.primaryGaugeName.toLowerCase();
      const words = claimed.toLowerCase().match(/[a-z']{4,}/g) ?? [];
      if (words.length > 0 && !words.some((w) => station.includes(w))) {
        findings.push({
          entityType: 'river',
          entityKey: row.riverSlug,
          ruleKey: 'summary_gauge_mismatch',
          title: `${row.riverSlug}: float summary credits the wrong gauge as primary`,
          detail:
            `The summary says "${claimed}" is the primary gauge, but the primary is ` +
            `"${row.primaryGaugeName}". The two sit on different drainage areas, so the numbers in the prose ` +
            `describe a different amount of water than the reading the rating is computed from.`,
          evidence: { claimedGauge: claimed, primaryGauge: row.primaryGaugeName },
        });
      }
    }
  }

  return findings;
}

export const floatSummaryCheck: TrustCheck = {
  id: 'float_summary',
  title: 'Float summary agrees with the ladder',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase
      .from('rivers')
      .select(
        'slug, float_summary, river_gauges!inner(is_primary, threshold_unit, level_dangerous, gauge_stations(name))',
      )
      .eq('active', true)
      .eq('river_gauges.is_primary', true)
      .order('slug');

    if (error) {
      throw new Error(`Failed to load rivers and primary gauges: ${error.message}`);
    }

    interface RiverRow {
      slug: string;
      float_summary: string | null;
      river_gauges: {
        threshold_unit: string | null;
        level_dangerous: number | string | null;
        gauge_stations: { name: string | null } | null;
      }[];
    }

    const rows: FloatSummaryRow[] = (data ?? []).map((r: RiverRow) => {
      const primary = r.river_gauges?.[0];
      return {
        riverSlug: r.slug,
        floatSummary: r.float_summary,
        thresholdUnit: primary?.threshold_unit ?? null,
        levelDangerous: primary?.level_dangerous == null ? null : Number(primary.level_dangerous),
        primaryGaugeName: primary?.gauge_stations?.name ?? null,
      };
    });

    return {
      scopeCount: rows.length,
      findings: deriveFloatSummaryFindings(rows),
    };
  },
};
