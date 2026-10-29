/** Evidence required before publication; existing live dossiers start pending. */
export const READINESS_CRITERIA = ['corridor', 'legalAccess', 'gauge', 'conditions', 'hazards', 'routing'] as const;
export type ReadinessCriterion = typeof READINESS_CRITERIA[number];
export interface ReadinessReview {
  /** Conditions criterion only. Omitted means the existing rated policy. */
  ratingMode?: 'rated' | 'unrated';
  status: 'pending' | 'verified' | 'blocked';
  evidence: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string;
}
/** dam_tailwater only: the pilot acceptance and exactly the endpoints activation publishes. */
export interface TailwaterPilotReview extends Omit<ReadinessReview, 'ratingMode'> {
  floatEndpoints: string[];
}
export type RiverReadiness = Record<ReadinessCriterion, ReadinessReview> & { tailwaterPilot?: TailwaterPilotReview };

export function readinessProblems(value: unknown): string[] {
  const reviews = value as Partial<RiverReadiness> | undefined;
  return READINESS_CRITERIA.flatMap(key => {
    const r = reviews?.[key];
    if (key === 'conditions' && r?.ratingMode !== undefined && !['rated', 'unrated'].includes(r.ratingMode)) return ['conditions: invalid rating mode'];
    if (r?.status !== 'verified') return [`${key}: ${r?.status ?? 'missing'}`];
    if (!Array.isArray(r.evidence) || !r.evidence.some(e => typeof e === 'string' && e.trim())) return [`${key}: missing evidence`];
    if (!r.reviewedBy?.trim() || !r.reviewedAt || !Number.isFinite(Date.parse(r.reviewedAt))) return [`${key}: missing reviewer/date`];
    return [];
  });
}

/** The database also checks floatEndpoints against the approved endpoints it would publish. */
export function tailwaterPilotProblems(value: unknown): string[] {
  const r = (value as Partial<RiverReadiness> | undefined)?.tailwaterPilot;
  if (r?.status !== 'verified') return [`tailwaterPilot: ${r?.status ?? 'missing'}`];
  if (!Array.isArray(r.evidence) || !r.evidence.some(e => typeof e === 'string' && e.trim())) return ['tailwaterPilot: missing evidence'];
  if (!r.reviewedBy?.trim() || !r.reviewedAt || !Number.isFinite(Date.parse(r.reviewedAt))) return ['tailwaterPilot: missing reviewer/date'];
  if (!Array.isArray(r.floatEndpoints) || !r.floatEndpoints.length) return ['tailwaterPilot: missing floatEndpoints'];
  return [];
}

/** Fresh worksheets carry no implied approval. */
export function pendingReadiness(): RiverReadiness {
  return READINESS_CRITERIA.reduce((reviews, key) => {
    reviews[key] = {
      status: 'pending', evidence: [], reviewedBy: null, reviewedAt: null,
      notes: 'Research and record the evidence for this criterion before activation.',
    };
    return reviews;
  }, {} as RiverReadiness);
}
