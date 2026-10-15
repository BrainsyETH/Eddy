import type { ArchiveRow, ArchiveWriteResult, CompletedFloat } from '@eddy/conditions/float-archive';

/** Older servers reject unknown fields; never acknowledge a backup with its note removed. */
export async function uploadFloatArchive(rows: ArchiveRow[], transport: {
  capabilities(): Promise<{ startNote?: boolean } | null>;
  write(rows: ArchiveRow[]): Promise<ArchiveWriteResult[]>;
}): Promise<ArchiveWriteResult[]> {
  if (rows.some(row => !row.deleted && row.kind === 'completed' &&
    (row.payload as CompletedFloat | null)?.startNote !== undefined)) {
    const supported = await transport.capabilities();
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
