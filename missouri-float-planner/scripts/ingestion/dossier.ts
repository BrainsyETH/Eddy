// scripts/ingestion/dossier.ts
// Research-dossier schema for onboarding a new river (Phase 1+).
//
// TWO-LAYER DESIGN (see docs/MULTI_STATE_SCALING_PLAN.md §5):
//   1. Research fills a JSON document conforming to these types. This layer is
//      "what we found and WHERE it came from" — provenance-rich, auditable.
//   2. A separate ingestion transform reads a VERIFIED dossier and emits DB
//      rows (nhd-rivers.json entry, river_characteristics, river_gauges
//      thresholds, river_sections, access-point candidates).
// Keeping the layers separate is what makes the safety gates real: nothing
// crosses from "found" to "committed" without passing its gate.
//
// VERIFICATION GATES — encoded per field in the comments:
//   [auto]     safe to ingest after a light sanity check
//   [verify]   MUST be confirmed against a primary source before ingest —
//              USGS site numbers, NHD feature id, park code. Research
//              hallucinates identifiers; these get checked against the real API.
//   [signoff]  owner signs before it can drive a LIVE condition badge —
//              thresholds and the representative-gauge choice. On rain_flashy
//              rivers (the Buffalo) the high/dangerous anchors gate on
//              corroboration; they do NOT ship provisional.
//   [manual]   a human places this in the admin UI; research only proposes —
//              access-point coordinates.

export type RiverType =
  | 'spring_fed_float'
  | 'dam_tailwater'
  | 'rain_flashy'
  | 'snowmelt'
  | 'flatwater';

export type ThresholdUnit = 'ft' | 'cfs';
export type Confidence = 'high' | 'medium' | 'low';
export type ThresholdLevel =
  | 'too_low'
  | 'low'
  | 'optimal_min'
  | 'optimal_max'
  | 'high'
  | 'dangerous';

/** The provenance envelope used throughout — a fact plus where it came from. */
export interface Sourced<T> {
  value: T;
  source: string; // URL or citation
  confidence: Confidence;
  corroboratingSources?: string[];
  note?: string;
}

/**
 * One threshold anchor for one condition level, tied to a specific gauge datum.
 *
 * THE make-or-break field is `referenceGauge`: outfitter/guide numbers are
 * quoted against wildly different references (USGS ft, USGS cfs, a nearby
 * gauge, a bridge piling, a private staff gauge). We only ingest an anchor
 * whose reference IS the gauge we poll for the reach (or is convertible to
 * it). Anything else is captured for the record but flagged non-ingestable.
 */
export interface ThresholdAnchor {
  level: ThresholdLevel;
  value: number; // [signoff]
  unit: ThresholdUnit;
  /** USGS site id the number is quoted against, or free text for a non-USGS datum. */
  referenceGauge: string;
  /** True only if referenceGauge is the gauge we actually poll for this reach. */
  referenceGaugeIsPolled: boolean;
  source: string;
  corroboratingSources?: string[];
  confidence: Confidence;
}

/** A candidate gauge. Every id and coordinate is [verify] against the provider API. */
export interface GaugeCandidate {
  provider: 'usgs' | 'usace' | string;
  siteId: string; // [verify]
  name: string;
  lat: number; // [verify] must match provider metadata
  lon: number;
  paramsAvailable: string[]; // e.g. ['00060','00065'] — discharge, gage height
  drainageAreaSqMi?: number; // enables drainage-area scaling to ungauged reaches
  positionRiverMile?: number;
  servesSections: string[]; // section slugs this gauge represents
  knownBias?: string; // e.g. "12 mi below take-out, two tributaries enter → reads high"
}

/** Per-section hydrology semantics — the source of Eddy's prompt language. */
export interface SectionCharacteristics {
  isSpringFed: boolean | null;
  /** Per-section archetype; may differ from the river-level default. Captured
   *  even though the pilot collapses to one river-level value at ingest. */
  hydroType: RiverType;
  primaryHazards: string[]; // ['flash_flood','strainer','low_water_dam','rapid',...]
  lowWaterMeaning: string; // what "low" physically means on THIS reach
  risingWaterHazards: string; // what rising water means here (flash-flood framing)
  rainLagHours?: number;
  rainLagNote?: string;
  dropRateNote?: string;
}

/** Published float times for speed calibration (target: within ~20% of these). */
export interface PublishedFloatTime {
  reachLabel: string; // "Ponca to Kyle's Landing"
  distanceMiles?: number;
  hoursTypical?: number;
  hoursLow?: number;
  hoursHigh?: number;
  vessel?: string; // canoe / kayak / raft, if stated
  source: string;
}

/**
 * A calibration reach — the UNIT of per-section calibration.
 *
 * On a single-personality river this is the whole river; on the Buffalo there
 * are several. Thresholds live per reach because each reach maps to a
 * representative gauge, and the segment-aware condition RPC already selects
 * the right gauge by river mile — so per-section threshold calibration works
 * on today's schema with no change.
 */
export interface RiverSectionDossier {
  slug: string;
  name: string; // "Upper Buffalo (Ponca to Pruitt)"
  description: string;
  putIn: { name: string; lat?: number; lon?: number };
  takeOut: { name: string; lat?: number; lon?: number };
  publishedLengthMiles?: number;
  representativeGauge: {
    siteId: string; // [signoff] — choosing the reach's gauge is a judgment call
    rationale: string;
    knownBias?: string;
  };
  thresholds: ThresholdAnchor[]; // [signoff] before the badge goes live
  publishedFloatTimes: PublishedFloatTime[];
  characteristics: SectionCharacteristics;
  hazards: Sourced<string>[];
  localKnowledge: string[]; // crowding, seasonality, tips → EDDY_KNOWLEDGE.md
}

/** An access point candidate. Coordinates are [manual] — a human places it. */
export interface AccessPointCandidate {
  name: string;
  type: string; // access / boat_ramp / bridge / park / ...
  lat?: number; // exact sourced coordinate (2026-07-08 enrichment); null = needs placement
  lon?: number;
  ownership?: string; // freeform, e.g. "Missouri Department of Conservation"
  section?: string; // section slug
  feeRequired?: boolean;
  notes?: string;
  source: string;
  // ---- 2026-07-08 enrichment; consumed by preload-dossier-access-points.py ----
  riverMile?: number;
  managingAgency?: string; // MDC | NPS | USFS | COE | State Park | County | Municipal | Private
  officialSiteUrl?: string;
  description?: string;
  parkingInfo?: string;
  roadAccess?: string;
  facilities?: string;
  coordinateSource?: string; // URL / method the lat/lon came from
  coordinateConfidence?: string; // high | medium | low | none
  coordinateNote?: string;
}

export interface RegulationItem {
  text: string;
  authority: string; // "NPS - Buffalo National River"
  sourceUrl: string;
  effectiveDate?: string;
}

/** The full research dossier for one river. */
export interface RiverDossier {
  // ---- Identity ----
  name: string;
  slug: string; // [verify] no collision with an existing (state, slug)
  state: string; // 'AR'
  country: string; // 'US'
  timezone: string; // 'America/Chicago'
  region: string; // 'Buffalo National River'
  nhdFeatureId: string; // [verify] resolves on the NHD / National Map
  difficultyRating?: string;
  description: string;
  /** River-level default archetype. Buffalo: 'rain_flashy'. */
  riverType: RiverType;

  // ---- Jurisdiction (the axis where the Buffalo matches the MO NPS rivers) ----
  parkCode?: string; // 'buff' [verify] resolves on the NPS API
  managingAuthority: string;
  regulations: RegulationItem[];
  permits: Sourced<string>[];
  accessLaw: Sourced<string>; // AR navigability / riparian — researched ONCE per state
  seasonalClosures: Sourced<string>[];

  // ---- Data sources ----
  /**
   * [signoff] The river-level primary gauge (a usgsSiteId from gauges[], and one
   * that carries thresholds). Drives the river condition badge and the Sonnet
   * river-level update, and is what validate_river_data() requires before a
   * river can go active. Ingest sets river_gauges.is_primary from this; it is
   * never guessed, so leaving it unset blocks the launch gate on purpose.
   */
  primaryGaugeSiteId?: string;
  gauges: GaugeCandidate[]; // [verify] every site id
  sections: RiverSectionDossier[]; // the section-aware calibration core
  accessPoints: AccessPointCandidate[]; // [manual]
  weatherPoint?: { city: string; lat: number; lon: number };
  alertSearchTerms: string[]; // river name, AR counties, towns — drives NWS matching

  // ---- Meta ----
  research: {
    date: string;
    sourcesConsulted: string[];
    openQuestions: string[]; // things research could not pin down
    toVerify: string[]; // explicit list of [verify] items for the anti-hallucination pass
  };
}
