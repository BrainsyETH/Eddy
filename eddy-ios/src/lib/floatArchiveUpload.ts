import type { ArchiveRow, ArchiveWriteResult, CompletedFloat } from '@eddy/conditions/float-archive';

/** How long one capability answer serves later batches: a sync, not a session. */
const CAPABILITIES_TTL_MS = 5 * 60_000;
let knownCapabilities: { at: number; value: { startNote?: boolean } | null } | null = null;

/** Older servers reject unknown fields; never acknowledge a backup with its note removed. */
export async function uploadFloatArchive(rows: ArchiveRow[], transport: {
  capabilities(): Promise<{ startNote?: boolean } | null>;
  write(rows: ArchiveRow[]): Promise<ArchiveWriteResult[]>;
}, now: () => number = Date.now): Promise<ArchiveWriteResult[]> {
  if (rows.some(row => !row.deleted && row.kind === 'completed' &&
    (row.payload as CompletedFloat | null)?.startNote !== undefined)) {
    // One capability request per sync, not one per batch: a positive answer
    // serves the batches that follow for a few minutes (and is re-asked after,
    // in case of a rollback). A negative answer is not kept, so the next
    // attempt, manual or scheduled, asks the server again.
    if (!knownCapabilities || now() - knownCapabilities.at > CAPABILITIES_TTL_MS) {
      const value = await transport.capabilities();
      knownCapabilities = value?.startNote === true ? { at: now(), value } : null;
      if (!knownCapabilities) {
        throw new Error('Float backup is temporarily unavailable. Your floats are saved on this phone. Try again later.');
      }
    }
    const supported = knownCapabilities.value;
    if (supported?.startNote !== true) {
      // A retryable failure keeps the local row dirty until the server is ready.
      throw new Error('Float backup is temporarily unavailable. Your floats are saved on this phone. Try again later.');
    }
  }
  return transport.write(rows.map(row => {
    if (row.kind !== 'completed' || !row.payload) return row;
    const { water: _water, ...payload } = row.payload as CompletedFloat;
    return { ...row, payload };
  }));
}
