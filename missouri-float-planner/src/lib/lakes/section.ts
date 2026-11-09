// src/lib/lakes/section.ts
// Assemble the "On the lake" section for a dam page from the registry, the
// dam's pool reading, Eddy's recorded pool history and the reviewed launches.
//
// `buildLakeSection` is pure so its field set and its rules can be asserted
// without a database (section.test.ts). `loadLakeSection` is the one reader.
// The section is a separate payload from DamSnapshot on purpose: the stored
// snapshot row, its contract test and the iOS wire stay untouched while the
// shape is still moving; it is promoted to the wire when iOS draws it.

import type { DamMetricValue } from '@shared/dam-types';
import { readingStaleness } from '@shared/dam-schedule-copy';
import { poolPosition, rampCaution } from '@shared/lake-status';
import type { LakeLaunch, LakeSection, LaunchMethod } from '@shared/lake-types';
import { lakeForDam, type LakeEntry } from './registry';
import { historyForWire, poolChange, toleranceFor, type PoolPoint } from './pool-history';
import { readApprovedLaunches, readPoolReadings, type LaunchRow } from './store';

export const HISTORY_DAYS = 7;

export interface LakeSectionInputs {
  lake: LakeEntry;
  /** The controlling dam's pool metric from the page snapshot, when it has one. */
  pool?: DamMetricValue;
  history: PoolPoint[];
  launches: LaunchRow[];
  now: number;
}

function launchFromRow(row: LaunchRow, lake: LakeEntry, poolFt: number | null): LakeLaunch {
  const methods = row.launch_methods.filter((m): m is LaunchMethod => m === 'trailer' || m === 'hand');
  const launch: LakeLaunch = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    lon: row.longitude,
    lat: row.latitude,
    launchMethods: methods,
    amenities: row.amenities ?? [],
    managingAgency: row.managing_agency,
    feeRequired: row.fee_required,
  };
  if (row.elev_datum && (row.ramp_bottom_elev_ft !== null || row.ramp_closure_elev_ft !== null)) {
    launch.thresholds = {
      bottomFt: row.ramp_bottom_elev_ft,
      closureFt: row.ramp_closure_elev_ft,
      datum: row.elev_datum,
      source: row.elev_source ?? 'managing agency',
      sourceUpdatedAt: row.elev_source_updated_at,
    };
    // The gate: cautions render only when a person has verified this lake's
    // thresholds, and only in one datum. Different datums are not compared.
    if (lake.rampCautionsVerified && poolFt !== null && row.elev_datum === lake.datum) {
      const caution = rampCaution({ elevationFt: poolFt, datum: lake.datum }, { bottomFt: row.ramp_bottom_elev_ft, closureFt: row.ramp_closure_elev_ft, datum: row.elev_datum });
      if (caution) launch.caution = caution;
    }
  }
  if (row.access_point) launch.accessPoint = { slug: row.access_point.slug, riverSlug: row.access_point.river_slug };
  return launch;
}

export function buildLakeSection({ lake, pool, history, launches, now }: LakeSectionInputs): LakeSection {
  const section: LakeSection = {
    slug: lake.slug,
    name: lake.name,
    states: [...lake.states],
    timeZone: lake.timeZone,
    datum: lake.datum,
    history: historyForWire(history, now, HISTORY_DAYS),
    launches: [],
    cautionsVerified: lake.rampCautionsVerified,
    sources: [lake.operatingRange?.source ?? '', 'Eddy pool record'].filter(Boolean),
  };
  if (pool) {
    section.pool = {
      valueFt: pool.value,
      at: pool.at,
      staleness: readingStaleness(pool.at, now) ?? pool.staleness,
      ...(pool.dailyMean ? { daily: true } : {}),
    };
    const position = poolPosition(pool.value, lake.operatingRange ? { conservationFt: lake.operatingRange.conservationFt, floodFt: lake.operatingRange.floodFt } : null);
    if (position) section.poolPosition = position;
  }
  if (lake.operatingRange) section.operatingRange = lake.operatingRange;
  // The change comes from Eddy's own record, which carries whether the source
  // is daily; the page snapshot's pool can be a day old (Truman) and the
  // record says so through the tolerance.
  const daily = Boolean(pool?.dailyMean);
  const h24 = poolChange(history, 24, toleranceFor(daily));
  const d7 = poolChange(history, 24 * 7, toleranceFor(daily));
  if (h24 !== null) section.change24hFt = h24;
  if (d7 !== null) section.change7dFt = d7;
  section.launches = launches.map((row) => launchFromRow(row, lake, pool?.value ?? null));
  return section;
}

/** The section for a dam, or null when Eddy carries no lake for it. Never throws. */
export async function loadLakeSection(damId: string, pool: DamMetricValue | undefined, now = Date.now()): Promise<LakeSection | null> {
  const lake = lakeForDam(damId);
  if (!lake) return null;
  const [history, launches] = await Promise.all([
    readPoolReadings(lake.slug, { days: HISTORY_DAYS + 1, now }),
    readApprovedLaunches(lake.slug),
  ]);
  return buildLakeSection({ lake, pool, history, launches, now });
}
