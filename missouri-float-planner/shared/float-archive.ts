// Private trip summaries only. Never add GPS arrays, tracker state or raw fixes.
export interface CompletedFloat {
  version: 1;
  id: string;
  riverSlug: string;
  riverName: string;
  putInId: string | null;
  putInName: string | null;
  /** Description of the recorded start, separate from the confirmed launch access. */
  startNote?: string;
  takeOutId: string;
  takeOutName: string;
  boatType: string | null;
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  movingMs: number;
  stoppedMs: number;
  unknownMs: number;
  distanceMiles: number;
  movingMph: number | null;
  plannerMph: number | null;
  firstMile: number | null;
  lastMile: number | null;
  /** Reaching the planned take-out is distinct from simply ending tracking. */
  reachedTakeOut: boolean;
  measurementVersion: 1;
  /** Historical reading resolved by the server; null when none is close enough. */
  water?: {
    gaugeName: string;
    gaugeStationId: string;
    observedAt: string;
    heightFt: number | null;
    dischargeCfs: number | null;
  } | null;
}

export interface SavedFloatSummary {
  shortCode: string;
  url: string;
  riverName: string;
  riverSlug: string;
  putInName: string;
  takeOutName: string;
  putInId?: string;
  takeOutId?: string;
  distanceLabel: string;
  savedAt: string;
  photoUrl?: string;
}

export type ArchiveKind = 'completed' | 'saved';
export interface ArchiveRow {
  id: string;
  kind: ArchiveKind;
  payload: CompletedFloat | SavedFloatSummary | null;
  deleted: boolean;
  /** Version of the explicit account opt-in when this float finished. */
  contributionVersion: string | null;
}
/** One result per input row, in the same order. A refusal keeps the local copy. */
export type ArchiveWriteResult =
  | { status: 'accepted' }
  | { status: 'rejected'; reason: string };
export interface ContributionPreference {
  enabled: boolean;
  version: string | null;
}
export const NO_CONTRIBUTION: ContributionPreference = { enabled: false, version: null };
