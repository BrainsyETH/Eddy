import { z } from 'zod';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { readMcpBody, validOrigin } from '@/lib/agent-tools/http';
import {
  approximateLocation,
  type FloatSearchPlace,
} from '@shared/float-search';

export const dynamic = 'force-dynamic';
const schema = z.object({ query: z.string().trim().min(2).max(120) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };

/** Explicit town lookup, never device coordinates. Temporary results stay off disk. */
export async function POST(request: Request) {
  if (!validOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const policy = { failClosed: true, requireGlobalLimiter: true };
  const local = await rateLimit(
    `float-places:${getClientIp(request)}`,
    20,
    60_000,
    policy,
  );
  if (local) return local;
  const global = await rateLimit('float-places:global', 120, 60_000, policy);
  if (global) return global;
  let parsed;
  try {
    parsed = schema.safeParse(await readMcpBody(request));
  } catch {
    return Response.json(
      { error: 'Enter a town and state.' },
      { status: 400, headers },
    );
  }
  if (!parsed.success)
    return Response.json(
      { error: 'Enter a town and state.' },
      { status: 400, headers },
    );
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token)
    return Response.json(
      {
        error:
          'Town search is unavailable. Choose a river or use your location.',
      },
      { status: 503, headers },
    );
  try {
    const query = new URLSearchParams({
      q: parsed.data.query,
      access_token: token,
      types: 'place',
      country: 'us',
      limit: '5',
      autocomplete: 'false',
    });
    // Do not log this URL, response, or errors: they can contain the town query.
    const response = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?${query}`,
      {
        cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
      },
    );
    if (!response.ok) throw new Error('Town lookup unavailable');
    const body = await response.json();
    const places: FloatSearchPlace[] = [];
    for (const feature of body.features ?? []) {
      const [lng, lat] = feature.geometry?.coordinates ?? [];
      const id = feature.properties?.mapbox_id;
      const name = feature.properties?.full_address;
      if (
        typeof id === 'string' &&
        typeof name === 'string' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        places.push({ id, name, near: approximateLocation({ lat, lng }) });
      }
    }
    return Response.json({ places }, { headers });
  } catch {
    return Response.json(
      { error: 'Town search is unavailable. Choose a river or try again.' },
      { status: 503, headers },
    );
  }
}
