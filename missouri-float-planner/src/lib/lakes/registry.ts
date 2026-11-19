// src/lib/lakes/registry.ts
// The lakes Eddy carries as entities, separate from the dams that control them.
//
// A dam describes the operation of a structure; a lake describes the waterbody
// and how people use it (ADR 0019). The registry is code, pinned by tests, for
// the reason usace-registry.ts is: identity and wiring belong under review, and
// a typo here should fail a test, not 404 a page. Rows that people review or
// that change daily (launches, pool readings) live in tables keyed by `slug`.
//
// Two entries to start, the Phase 1 pilot (LAKES_AND_LAUNCHES_PLAN_2026-11-09.md
// step 2). Add a lake only with a live pool source and a defined user purpose.

import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { VerticalDatum } from '@shared/lake-status';
import type { LakeOperatingRange } from '@shared/lake-types';

export type ControllingDamRole =
  /** The dam impounds this lake; its pool IS the lake level. */
  | 'impounds'
  /** The dam holds the lake's downstream end (Powersite under Taneycomo). */
  | 'holdsBelow'
  /** The lake receives this dam's releases (Lake of the Ozarks from Truman). */
  | 'receivesFrom';

export type LakePoolSource =
  /** Read the pool from the controlling dam's `poolElevation` metric and series. */
  | { kind: 'dam'; damId: string };

export interface LakeSources {
  /** `recprojectsitename` in the Corps recreation-status layer, exact and upper case. */
  usaceRecreationProjects: readonly string[];
  /** `nwk_lakename_t` in the Kansas City District ramp layer, when the lake is in that district. */
  nwkRampLake?: string;
  /** `waterbody` spellings in the AGFC facility layer. */
  agfcWaterbodies?: readonly string[];
  /** USGS 3DHP waterbody ids (`id3dhp`), the polygons Phase 0 joined against. */
  hydrography3dhp: readonly string[];
}

export interface LakeEntry {
  slug: string;
  name: string;
  states: readonly string[];
  timeZone: 'America/Chicago';
  controllingDams: ReadonlyArray<{ damId: string; role: ControllingDamRole }>;
  pool: LakePoolSource;
  /**
   * How often the pool source publishes. Drives the change tolerance, the
   * "Daily report" label and the caution age limit; never inferred from the
   * dam snapshot, whose Truman metric carries no cadence of its own.
   */
  poolCadence: 'hourly' | 'daily';
  datum: VerticalDatum;
  /** Optional on purpose: a lake without a documented range shows the number and says so. */
  operatingRange?: LakeOperatingRange;
  /**
   * Whether elevation cautions may render for this lake's launches. False until
   * the ramp thresholds have been checked against the district's posted tables
   * by a person (Phase 0 item 2 gate). The arithmetic exists either way.
   */
  rampCautionsVerified: boolean;
  /**
   * The lake's neighbours, for the "Where the water goes" rows. Facts about
   * the map, declared from a source and never inferred from a gauge: a river
   * listed here flows into this lake, a dam listed here releases water that
   * reaches it. Where the release goes is read from the dam registry's
   * `tailwater` when that is a river Eddy carries, and from `releasesInto`
   * when it is the next lake down.
   */
  system?: {
    /** `rivers.slug` of rivers Eddy carries that flow into this lake. */
    feederRivers?: readonly string[];
    /** Registry dams upstream, with the river that carries their release here. */
    upstreamDams?: ReadonlyArray<{ damId: string; via: string }>;
    /** The registry dam holding the lake this one releases into. */
    releasesInto?: string;
  };
  sources: LakeSources;
}

export const LAKES: Record<string, LakeEntry> = {
  'table-rock': {
    slug: 'table-rock',
    name: 'Table Rock Lake',
    states: ['MO', 'AR'],
    timeZone: 'America/Chicago',
    controllingDams: [{ damId: 'swl-table-rock-dam', role: 'impounds' }],
    pool: { kind: 'dam', damId: 'swl-table-rock-dam' },
    poolCadence: 'hourly',
    datum: 'NGVD29',
    // Conservation pool 915.0 ft and top of flood-control pool 931.0 ft, the
    // elevations the Little Rock District publishes for the project and the
    // ones its `%-Flood Pool` series is computed against.
    operatingRange: {
      conservationFt: 915.0,
      floodFt: 931.0,
      source: 'USACE Little Rock District, Table Rock Lake project data',
      asOf: '2026-11-09',
    },
    rampCautionsVerified: false,
    // The James and the Kings each run into their own arm of the lake, and the
    // White arrives from Beaver Dam (USACE Little Rock District, Table Rock
    // Lake project map). Below, the release is Lake Taneycomo, which the dam
    // registry already names as this dam's tailwater.
    system: {
      feederRivers: ['james', 'kings-river'],
      upstreamDams: [{ damId: 'swl-beaver-dam', via: 'White River' }],
    },
    sources: {
      usaceRecreationProjects: ['TABLE ROCK LAKE'],
      agfcWaterbodies: ['Table Rock Lake'],
      hydrography3dhp: ['JQI1T', 'LDW7O'],
    },
  },
  truman: {
    slug: 'truman',
    name: 'Truman Lake',
    states: ['MO'],
    timeZone: 'America/Chicago',
    controllingDams: [{ damId: 'nwk-truman-dam', role: 'impounds' }],
    // Kansas City publishes nothing to CWMS; the pool arrives through Ameren's
    // Osage daily report, about a day in arrears (usace-registry.ts, Truman).
    pool: { kind: 'dam', damId: 'nwk-truman-dam' },
    poolCadence: 'daily',
    datum: 'NGVD29',
    operatingRange: {
      conservationFt: 706.0,
      floodFt: 739.6,
      source: 'USACE Kansas City District, Harry S. Truman Dam and Reservoir project data',
      asOf: '2026-11-09',
    },
    rampCautionsVerified: false,
    // Truman releases straight into the head of Lake of the Ozarks, which is
    // why Ameren's Osage report carries Truman's numbers at all. Eddy carries
    // none of the rivers that feed it (Osage, South Grand, Pomme de Terre,
    // Sac), so no feeder rows: an empty list is the honest state.
    system: { releasesInto: 'ameren-bagnell-dam' },
    sources: {
      usaceRecreationProjects: ['HARRY S. TRUMAN DAM AND RESERVOIR MISSOURI'],
      nwkRampLake: 'Truman Lake',
      hydrography3dhp: ['JZ940', 'LHBG8', 'MV7YZ'],
    },
  },
};

export function getLake(slug: string): LakeEntry | undefined {
  return LAKES[slug];
}

/** The lake a dam impounds, if Eddy carries it as an entity. */
export function lakeForDam(damId: string): LakeEntry | undefined {
  return Object.values(LAKES).find((lake) => lake.controllingDams.some((d) => d.damId === damId && d.role === 'impounds'));
}

/** The dam whose pool metric is this lake's level, resolved against the dam registry. */
export function poolDamFor(lake: LakeEntry) {
  return getUsaceDam(lake.pool.damId);
}
