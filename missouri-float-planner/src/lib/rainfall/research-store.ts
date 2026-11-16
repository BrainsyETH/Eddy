import { gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hash, MAX_BYTES, RESEARCH_BUCKET } from './research-contract';

export interface Capture {
  kind: 'basins' | 'mrms' | 'nws' | 'gauges'; sourceKey: string; basinSetHash: string;
  start?: string; end?: string; issuedAt?: string; metadata: Record<string, unknown>;
  bytes: Uint8Array;
}
/** Content-addressed objects and immutable rows preserve revisions and permit safe retries. */
export async function saveCapture(db: SupabaseClient, capture: Capture): Promise<number> {
  const compressed = gzipSync(capture.bytes);
  if (compressed.length > MAX_BYTES) throw new Error('Archive exceeds storage limit');
  const sha = hash(compressed);
  const identity = { kind: capture.kind, source: capture.sourceKey, basin: capture.basinSetHash,
    start: capture.start, end: capture.end, issued: capture.issuedAt, sha, metadata: capture.metadata };
  const id = hash(JSON.stringify(identity)), path = `${capture.kind}/${sha}.gz`;
  const { data, error: existingError } = await db.from('rainfall_research_captures').select('id').eq('id', id).maybeSingle();
  if (existingError) throw existingError;
  if (data) return 0;
  // Never overwrite a historic object. A previous upload can survive a failed DB insert.
  const { error: uploadError } = await db.storage.from(RESEARCH_BUCKET).upload(path, compressed, { contentType: 'application/gzip', upsert: false });
  if (uploadError && !['409', 'Duplicate', 'ResourceAlreadyExists'].includes(String('statusCode' in uploadError ? uploadError.statusCode : ''))
    && !/already exists/i.test(uploadError.message)) throw uploadError;
  const { error } = await db.from('rainfall_research_captures').upsert({
    id, kind: capture.kind, source_key: capture.sourceKey, basin_set_hash: capture.basinSetHash,
    valid_start: capture.start ?? null, valid_end: capture.end ?? null, source_updated_at: capture.issuedAt ?? null,
    object_path: path, sha256: sha, byte_count: compressed.length, metadata: capture.metadata,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  return compressed.length;
}
