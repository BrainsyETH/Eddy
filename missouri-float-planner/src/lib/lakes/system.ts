// src/lib/lakes/system.ts
// A lake's neighbours, upstream to downstream: what feeds it, the dam that
// holds it, where the release goes. Each row is a place Eddy already has a
// page for; the lake page links them instead of repeating them.
//
// `buildLakeSystem` is pure. Relationships come from the registries (a river
// listed as a feeder IS one), readings come from the snapshots handed in, and
// a neighbour with no reading keeps its row only where the row is still a
// useful door: the lake's own dam, and where its release goes.

import type { DamMetricValue, DamSnapshot } from '@shared/dam-types';
import type { LakeSystemFlow, LakeSystemRow } from '@shared/lake-types';
import type { RiverListItem } from '@/types/api';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { LakeEntry } from './registry';

export interface LakeSystemInputs {
  lake: LakeEntry;
  /** The lake's own dam, as the page shows it. Null when no snapshot could be read. */
  dam: DamSnapshot | null;
  /** Other registry dams by id; a neighbour missing here has no reading to show. */
  dams: ReadonlyMap<string, DamSnapshot>;
  /** Rivers Eddy carries, by slug. A feeder missing here is inactive and gets no row. */
  rivers: ReadonlyMap<string, RiverListItem>;
}

function flow(metric: DamMetricValue | undefined, daily = false): LakeSystemFlow | undefined {
  if (!metric || !Number.isFinite(metric.value)) return undefined;
  return { cfs: metric.value, at: metric.at, ...(metric.dailyMean ? { dailyMean: true } : {}), ...(daily ? { daily: true } : {}) };
}

function riverRow(river: RiverListItem, stage: 'coming_in' | 'below'): LakeSystemRow {
  const row: Extract<LakeSystemRow, { kind: 'river' }> = { kind: 'river', stage, slug: river.slug, state: river.state, name: river.name };
  const condition = river.currentCondition;
  if (!condition) return row;
  // "Unknown" is the absence of a rating, not a rating worth a line.
  if (condition.code !== 'unknown') row.condition = { code: condition.code, label: condition.label };
  const value = condition.thresholdUnit === 'ft' ? condition.gaugeHeightFt : condition.thresholdUnit === 'cfs' ? condition.dischargeCfs : null;
  if (value !== null && Number.isFinite(value) && condition.thresholdUnit) {
    row.reading = { value, unit: condition.thresholdUnit, ...(condition.readingTimestamp ? { at: condition.readingTimestamp } : {}) };
  }
  return row;
}

export function buildLakeSystem({ lake, dam, dams, rivers }: LakeSystemInputs): LakeSystemRow[] {
  const rows: LakeSystemRow[] = [];
  const poolDam = getUsaceDam(lake.pool.damId);
  if (!poolDam) return rows;

  // The cadence of the lake's own dam comes from the registry, as the level
  // card's does: Truman's metrics arrive in one daily report and carry no
  // cadence of their own, so without this a 13-hour-old release would read
  // "Outdated" beside a level the same report made current.
  const daily = lake.poolCadence === 'daily';
  const inflow = flow(dam?.metrics.inflow, daily);
  if (inflow) rows.push({ kind: 'inflow', stage: 'coming_in', flow: inflow });

  for (const upstream of lake.system?.upstreamDams ?? []) {
    const entry = getUsaceDam(upstream.damId);
    const release = flow(dams.get(upstream.damId)?.metrics.release);
    // An upstream dam earns a row by what it is sending; without a release it is only a name.
    if (!entry || !release) continue;
    const generating = dams.get(upstream.damId)?.generating;
    rows.push({
      kind: 'dam', stage: 'coming_in', damId: entry.id, name: entry.name, via: upstream.via, release,
      ...(typeof generating === 'boolean' ? { generating } : {}),
    });
  }

  for (const slug of lake.system?.feederRivers ?? []) {
    const river = rivers.get(slug);
    if (river) rows.push(riverRow(river, 'coming_in'));
  }

  const release = flow(dam?.metrics.release, daily);
  rows.push({
    kind: 'dam', stage: 'dam', damId: poolDam.id, name: poolDam.name,
    ...(release ? { release } : {}),
    ...(typeof dam?.generating === 'boolean' ? { generating: dam.generating } : {}),
  });

  const tailwater = poolDam.tailwater ? rivers.get(poolDam.tailwater.riverSlug) : undefined;
  if (tailwater) {
    rows.push(riverRow(tailwater, 'below'));
  } else if (lake.system?.releasesInto) {
    const entry = getUsaceDam(lake.system.releasesInto);
    if (entry) {
      const next = dams.get(entry.id);
      // The next lake's level only. What ITS dam releases is a third place down
      // the river, and belongs to that dam's page.
      const pool = next?.metrics.poolElevation;
      rows.push({
        kind: 'dam', stage: 'below', damId: entry.id, name: entry.name,
        ...(entry.lakeName ? { lakeName: entry.lakeName } : {}),
        ...(pool && Number.isFinite(pool.value) ? { pool: { valueFt: pool.value, at: pool.at } } : {}),
      });
    }
  }
  return rows;
}
