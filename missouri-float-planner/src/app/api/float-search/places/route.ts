import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCoordinates } from '@/lib/api-utils';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { readMcpBody, validOrigin } from '@/lib/agent-tools/http';
import {
  approximateLocation,
  type FloatSearchPlace,
} from '@shared/float-search';

export const dynamic = 'force-dynamic';
const schema = z.object({ query: z.string().trim().min(2).max(120) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
// Center of Eddy's coverage; ranks Salem, MO above other Salems.
const OZARKS = '-92.2,37.0';

/** Named launches from Eddy's own catalog, e.g. "Akers" or "Alley Spring". */
async function accessPlaces(query: string): Promise<FloatSearchPlace[]> {
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const { data, error } = await (await createClient())
    .from('access_points')
    .select('id, name, location_orig, location_snap, rivers!inner(slug, name, active)')
    .eq('approved', true)
    .eq('is_float_endpoint', true)
    .eq('rivers.active', true)
    .ilike('name', pattern)
    .order('name')
    .limit(5);
  if (error) throw new Error('Access lookup unavailable');
  return (data ?? []).flatMap((row) => {
    const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
    const point = getCoordinates(row.location_orig) ?? getCoordinates(row.location_snap);
    return river && point
      ? [{ id: `access:${row.id}`, name: row.name, kind: 'access' as const, river: river.slug, riverName: river.name, near: approximateLocation(point) }]
      : [];
  });
}

async function townPlaces(query: string, token: string, signal: AbortSignal): Promise<FloatSearchPlace[]> {
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    types: 'place,locality,neighborhood',
    country: 'us',
    proximity: OZARKS,
    limit: '5',
    autocomplete: 'true',
  });
  // Do not log this URL, response, or errors: they can contain the town query.
  const response = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
    { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
  );
  if (!response.ok) throw new Error('Town lookup unavailable');
  const body = await response.json();
  const places: FloatSearchPlace[] = [];
  for (const feature of body.features ?? []) {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const id = feature.properties?.mapbox_id;
    const name = feature.properties?.full_address;
    if (typeof id === 'string' && typeof name === 'string' && Number.isFinite(lat) && Number.isFinite(lng)) {
      places.push({ id, name, kind: 'town', near: approximateLocation({ lat, lng }) });
    }
  }
  return places;
}

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
  const [accesses, towns] = await Promise.allSettled([
    accessPlaces(parsed.data.query),
    token ? townPlaces(parsed.data.query, token, request.signal) : Promise.reject(new Error('Town lookup unavailable')),
  ]);
  if (accesses.status === 'rejected' && towns.status === 'rejected')
    return Response.json(
      { error: 'Town search is unavailable. Choose a river or use your location.' },
      { status: 503, headers },
    );
  return Response.json(
    {
      places: [
        ...(accesses.status === 'fulfilled' ? accesses.value : []),
        ...(towns.status === 'fulfilled' ? towns.value : []),
      ],
    },
    { headers },
  );
}
