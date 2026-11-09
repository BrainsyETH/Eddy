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

/**
 * The oldest pool a caution may be computed from. An hourly source past six
 * hours is stale by the dam page's own rule; a daily source is a day old by
 * construction, so it gets a day and a half and no more. Past this, the
 * launch shows its thresholds and no caution: the arithmetic would be
 * comparing a ramp with where the lake used to be.
 */
export const CAUTION_POOL_MAX_AGE_HOURS: Record<LakeEntry['poolCadence'], number> = { hourly: 6, daily: 36 };

export interface LakeSectionInputs {
  lake: LakeEntry;
  /** The controlling dam's pool metric from the page snapshot, when it has one. */
  pool?: DamMetricValue;
  history: PoolPoint[];
  launches: LaunchRow[];
  now: number;
}

function launchFromRow(row: LaunchRow, lake: LakeEntry, pool: { valueFt: number; ageHours: number } | null): LakeLaunch {
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
    // Three gates, all required: a person has verified this lake's thresholds,
    // the pool is young enough for its cadence, and both sit in one datum.
    const poolFresh = pool !== null && pool.ageHours <= CAUTION_POOL_MAX_AGE_HOURS[lake.poolCadence];
    if (lake.rampCautionsVerified && poolFresh && row.elev_datum === lake.datum) {
      const caution = rampCaution({ elevationFt: pool.valueFt, datum: lake.datum }, { bottomFt: row.ramp_bottom_elev_ft, closureFt: row.ramp_closure_elev_ft, datum: row.elev_datum });
      if (caution) launch.caution = caution;
    }
  }
  if (row.access_point) launch.accessPoint = { slug: row.access_point.slug, riverSlug: row.access_point.river_slug, state: row.access_point.state };
  return launch;
}

export function buildLakeSection({ lake, pool, history, launches, now }: LakeSectionInputs): LakeSection {
  const daily = lake.poolCadence === 'daily';
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
  let poolForCautions: { valueFt: number; ageHours: number } | null = null;
  if (pool) {
    section.pool = {
      valueFt: pool.value,
      at: pool.at,
      staleness: readingStaleness(pool.at, now) ?? pool.staleness,
      ...(daily ? { daily: true } : {}),
    };
    poolForCautions = { valueFt: pool.value, ageHours: (now - Date.parse(pool.at)) / 3_600_000 };
    const position = poolPosition(pool.value, lake.operatingRange ? { conservationFt: lake.operatingRange.conservationFt, floodFt: lake.operatingRange.floodFt } : null);
    if (position) section.poolPosition = position;
  }
  if (lake.operatingRange) section.operatingRange = lake.operatingRange;
  // The change comes from Eddy's own record. The tolerance follows the
  // registry's cadence, not anything the dam snapshot says about itself.
  const h24 = poolChange(history, 24, toleranceFor(daily));
  const d7 = poolChange(history, 24 * 7, toleranceFor(daily));
  if (h24 !== null) section.change24hFt = h24;
  if (d7 !== null) section.change7dFt = d7;
  section.launches = launches.map((row) => launchFromRow(row, lake, poolForCautions));
  return section;
}

/** Whether the section says anything worth a card on a high-traffic page: a reading, or a reviewed launch. */
export function lakeSectionHasContent(section: LakeSection | null | undefined): section is LakeSection {
  return Boolean(section && (section.pool || section.launches.length > 0));
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
