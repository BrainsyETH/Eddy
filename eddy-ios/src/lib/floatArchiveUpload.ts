import type { ArchiveRow, ArchiveWriteResult, CompletedFloat } from '@eddy/conditions/float-archive';

/** How long one capability answer serves later batches: a sync, not a session. */
const CAPABILITIES_TTL_MS = 5 * 60_000;

/**
 * What the server says it can store. An older server rejects any field its
 * strict schema does not know, so each newer field is sent only to a server
 * that names its flag.
 */
export type ArchiveCapabilities = { startNote?: boolean; recapContext?: boolean; recapRouteWeather?: boolean };
type CapabilityFlag = keyof ArchiveCapabilities;

/** The recap fields `recapContext` covers (docs/float-history-card-plan.md, 2e). */
const RECAP_CONTEXT_FIELDS = ['startCondition', 'riverSpan', 'coveredMiles', 'startWeather'] as const;

let knownCapabilities: { at: number; value: ArchiveCapabilities } | null = null;

/**
 * The capabilities a row needs before it may be sent. floatArchiveCore.ts
 * batches these rows last, on their own, so one waiting for a server upgrade
 * never holds back a deletion or a saved route.
 */
export function capabilitiesNeeded(row: Pick<ArchiveRow, 'kind' | 'deleted' | 'payload'>): CapabilityFlag[] {
  if (row.deleted || row.kind !== 'completed' || !row.payload) return [];
  const trip = row.payload as CompletedFloat;
  const flags: CapabilityFlag[] = [];
  if (trip.startNote !== undefined) flags.push('startNote');
  if (RECAP_CONTEXT_FIELDS.some((field) => trip[field] !== undefined)) flags.push('recapContext');
  if (trip.routeSnapshot !== undefined || trip.startWeather?.conditionIcon !== undefined) flags.push('recapRouteWeather');
  return flags;
}

/** Older servers reject unknown fields; never acknowledge a backup with a field removed. */
export async function uploadFloatArchive(rows: ArchiveRow[], transport: {
  capabilities(): Promise<ArchiveCapabilities | null>;
  write(rows: ArchiveRow[]): Promise<ArchiveWriteResult[]>;
}, now: () => number = Date.now): Promise<ArchiveWriteResult[]> {
  const needed = [...new Set(rows.flatMap(capabilitiesNeeded))];
  if (needed.length > 0) {
    // One capability request per sync, not one per batch: an answer that
    // covers what this batch needs serves the batches that follow for a few
    // minutes (and is re-asked after, in case of a rollback). An answer that
    // falls short is not kept, so the next attempt, manual or scheduled, asks
    // the server again.
    const covers = (value: ArchiveCapabilities | null | undefined): value is ArchiveCapabilities =>
      value != null && needed.every((flag) => value[flag] === true);
    if (!knownCapabilities || now() - knownCapabilities.at > CAPABILITIES_TTL_MS || !covers(knownCapabilities.value)) {
      const value = await transport.capabilities();
      knownCapabilities = covers(value) ? { at: now(), value } : null;
      if (!knownCapabilities) {
        // A retryable failure keeps the local row dirty until the server is
        // ready. Stripping the fields instead would lose them for good: a
        // completed row is immutable on the server, and a sync then replaces
        // the phone's copy with the server's.
        throw new Error('Float backup is temporarily unavailable. Your floats are saved on this phone. Try again later.');
      }
    }
  }
  return transport.write(rows.map(row => {
    if (row.kind !== 'completed' || !row.payload) return row;
    const { water: _water, ...payload } = row.payload as CompletedFloat;
    return { ...row, payload };
  }));
}
