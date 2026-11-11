import { trackedFetch } from '@/lib/telemetry/upstream';
import { MAX_BYTES } from './research-contract';

/** Bounded body reads, timeout and one retry; provider payloads never enter logs. */
export async function researchFetch(url: string, deadline: AbortSignal): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (!['https://api.weather.gov', 'https://mapservices.weather.noaa.gov'].includes(parsed.origin)) throw new Error('Unapproved research source');
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    deadline.throwIfAborted();
    try {
      const response = await trackedFetch('nws', parsed.hostname === 'api.weather.gov' ? 'rainfall-research-forecast' : 'rainfall-research-mrms', url, {
        headers: { Accept: 'application/geo+json,application/json,image/tiff', 'User-Agent': 'Eddy rainfall research (https://eddy.guide; support@eddy.guide)' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) throw new Error(`Research source HTTP ${response.status}`);
      if (!response.body || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('Source body exceeds limit');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > MAX_BYTES) throw new Error('Source body exceeds limit');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    } catch (error) { failure = error; }
  }
  throw failure;
}
export async function researchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const data: unknown = JSON.parse(Buffer.from(await researchFetch(url, signal)).toString('utf8'));
  if (data && typeof data === 'object' && 'error' in data) throw new Error('Research source returned an error');
  return data;
}
