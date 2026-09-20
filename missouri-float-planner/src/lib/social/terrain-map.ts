import { put } from '@vercel/blob';
import { terrainMapPlan, terrainMapUrl } from '../../../shared/social-terrain-map';
import type { LngLat } from '../../../shared/social-route-journey';

/** Fetch once before dispatch; render workers receive an immutable image, never a token. */
export async function prepareTerrainMap(coordinates: LngLat[], services = { fetch, put }): Promise<string> {
  const plan = terrainMapPlan(coordinates);
  if (!plan) throw new Error('Route cannot be projected onto the terrain map');
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('MAPBOX_ACCESS_TOKEN is required for social terrain maps');
  const response = await services.fetch(terrainMapUrl(plan, token), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Terrain map request failed (${response.status})`);
  if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Terrain provider returned no image');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 12 * 1024 * 1024) throw new Error('Terrain image has an invalid size');
  const blob = await services.put(`social-maps/terrain-${crypto.randomUUID()}.png`, bytes, {
    access: 'public', contentType: 'image/png', addRandomSuffix: false,
  });
  return blob.url;
}
