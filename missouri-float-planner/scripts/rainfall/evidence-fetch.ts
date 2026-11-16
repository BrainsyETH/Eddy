/** Bounded reads shared by the read-only rainfall evidence captures. */
import { MODERN_BASE, modernHeaders } from '../../src/lib/flow-providers/usgs';

const headers = { Accept: 'application/json,image/tiff', 'User-Agent': 'Eddy rainfall source validation (https://eddy.guide)' };
export async function bytes(url: string, requestHeaders: HeadersInit = headers): Promise<Uint8Array> {
  let failure: unknown;
  // An operator capture, not a cron: three bounded tries for a busy provider.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(done => setTimeout(done, attempt * 4000));
    try {
      const response = await fetch(url, { headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`${response.status} from ${new URL(url).hostname}`);
      if (response.status < 500) break;
    } catch (error) { failure = error; }
  }
  throw failure;
}
export const json = async (url: string, requestHeaders?: HeadersInit): Promise<unknown> => {
  const data: unknown = JSON.parse(Buffer.from(await bytes(url, requestHeaders)).toString('utf8'));
  if (data && typeof data === 'object' && 'error' in data) throw new Error('Provider returned an error');
  return data;
};

/** Every rain-gauge reading (parameter 00045) in the box and window, following USGS's own next links. */
export async function gaugeReadings(box: number[], start: string, end: string) {
  const first = new URL(`${MODERN_BASE}/continuous/items`);
  for (const [key, value] of [['f', 'json'], ['bbox', box.map(n => n.toFixed(4)).join(',')], ['parameter_code', '00045'],
    ['datetime', `${start}/${end}`], ['limit', '10000']]) first.searchParams.set(key, value);
  const features: unknown[] = [];
  let url: string | null = first.toString(), pages = 0;
  while (url) {
    if (new URL(url).hostname !== first.hostname || ++pages > 20) throw new Error('USGS paging left its host or did not end');
    const page = await json(url, modernHeaders()) as { features?: unknown[]; links?: { rel?: string; href?: string }[] };
    if (!Array.isArray(page.features)) throw new Error('USGS returned no reading list');
    features.push(...page.features);
    url = page.links?.find(link => link.rel === 'next')?.href ?? null;
  }
  return { url: first.toString(), pages, document: { type: 'FeatureCollection', features } };
}
