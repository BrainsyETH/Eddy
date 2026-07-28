// shared/reach-types.ts
//
// The shape of a river reach as /api/rivers/[slug]/reaches serves it, shared
// between the web river hub and the eddy-ios river screen.
//
// Here rather than packages/eddy-types for the same reason dam-types.ts is:
// Vercel builds with Root Directory = missouri-float-planner/ and this app's
// tsconfig maps only `@/*` and `@shared/*`, so it has no path to packages/.
// eddy-types reaches across into this directory instead, which is the direction
// that works. Pure TypeScript, no imports, so Metro, tsx and Next can all
// consume it.
//
// ── What a reach is, and what it is not ────────────────────────────────────
// A reach is a stretch of one river whose water behaves differently enough that
// a single condition badge for the whole river would be wrong for part of it.
// The case this exists for is a dam: above Clearwater the Black is a spring-fed
// float that responds to rain, and below it is a flood-control tailwater that
// rises on a release schedule under a clear sky.
//
// It is NOT a float segment. Most rivers carrying river_sections rows use them
// as a put-in/take-out catalogue — the Big Piney has eight — and those are not
// different water. A reach reaches this API only by declaring its own
// river_type, which is why `differsFromRiver` exists and why both clients gate
// their panel on it.

/** Hydrological archetype. Mirrors rivers.river_type / river_sections.river_type. */
export type ReachRiverType =
  | 'spring_fed_float'
  | 'dam_tailwater'
  | 'rain_flashy'
  | 'snowmelt'
  | 'flatwater';

export interface ReachReport {
  summaryText: string | null;
  quoteText: string;
  generatedAt: string;
}

export interface RiverReach {
  sectionSlug: string;
  name: string;
  description: string | null;
  /** Effective hydrology: the reach's own river_type, else the river's. */
  riverType: ReachRiverType;
  /**
   * True when this reach overrides the river's type. The only reason to render
   * a reach panel at all — where every reach agrees with the river, the panel
   * would be a heading that explains nothing.
   */
  differsFromRiver: boolean;
  /**
   * Bounds in access_points.river_mile_downstream miles ("from headwaters,
   * hand-entered"), null meaning unbounded that way. NOT the geometry frame:
   * on the Black the two differ by ~8 miles.
   */
  riverMileStart: number | null;
  riverMileEnd: number | null;
  /** Live condition for THIS reach, read through its own gauge. */
  conditionCode: string;
  conditionLabel: string | null;
  gaugeName: string | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** This reach's own Eddy report, or null if none is current. */
  report: ReachReport | null;
}

export interface RiverReachesResponse {
  reaches: RiverReach[];
}
