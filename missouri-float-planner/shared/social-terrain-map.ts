import { validRouteCoordinates, type LngLat, type Journey } from './social-route-journey';
import { ROUTE_MAP_STAGE, ROUTE_STAGE_TOP } from './social-route-layout';
import { REEL_SAFE } from './social-brand';

// One camera for the full-bleed 1080x1920 image and the animated route.
// Static Images uses 512px Mercator tiles; 540x960 @2x produces our exact canvas.
export const TERRAIN_WIDTH = 1080;
export const TERRAIN_HEIGHT = 1920;
const mercator = ([lng, lat]: LngLat) => ({
  x: (lng + 180) / 360,
  y: (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2,
});
const latitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;

export function terrainMapPlan(coordinates: ReadonlyArray<LngLat> | undefined) {
  const clean = validRouteCoordinates(coordinates);
  if (clean.length < 2 || clean.some(p => Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85)) return null;
  const world = clean.map(mercator);
  const xs = world.map(p => p.x), ys = world.map(p => p.y);
  const dx = Math.max(...xs) - Math.min(...xs), dy = Math.max(...ys) - Math.min(...ys);
  if (Math.max(dx, dy) < 1e-12 || dx > 0.5) return null;
  const fit = Math.min(
    (ROUTE_MAP_STAGE.width - 2 * 130) / Math.max(dx, 1e-12),
    (ROUTE_MAP_STAGE.height - 2 * 80) / Math.max(dy, 1e-12),
  );
  // Round DOWN to the same two decimals the provider accepts, leaving padding.
  const zoom = Math.max(0, Math.min(18, Math.floor(Math.log2(fit / 1024) * 100) / 100));
  const scale = 1024 * 2 ** zoom;
  const targetX = REEL_SAFE.left + ROUTE_MAP_STAGE.width / 2;
  const targetY = ROUTE_STAGE_TOP + ROUTE_MAP_STAGE.height / 2;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - (targetX - TERRAIN_WIDTH / 2) / scale;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 - (targetY - TERRAIN_HEIGHT / 2) / scale;
  // Quantize the camera before projection so URL and overlay cannot disagree.
  const lng = Number((cx * 360 - 180).toFixed(8));
  const lat = Number(latitude(cy).toFixed(8));
  const center = mercator([lng, lat]);
  const points = world.map(p => ({
    x: (p.x - center.x) * scale + TERRAIN_WIDTH / 2 - REEL_SAFE.left,
    y: (p.y - center.y) * scale + TERRAIN_HEIGHT / 2 - ROUTE_STAGE_TOP,
  }));
  // Stops use progressAlongRoute’s local planar distance, not Mercator arc length.
  const lngScale = Math.cos((Math.min(...clean.map(p => p[1])) + Math.max(...clean.map(p => p[1]))) / 2 * Math.PI / 180);
  const source = [0];
  for (let i = 1; i < clean.length; i++) source.push(source[i - 1] + Math.hypot((clean[i][0] - clean[i - 1][0]) * lngScale, clean[i][1] - clean[i - 1][1]));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const length = cumulative[cumulative.length - 1];
  const journey: Journey = {
    raw: points, points, maxDeviationPx: 0,
    locate(progress) {
      const p = Math.max(0, Math.min(1, progress));
      const distance = p * source[source.length - 1];
      let i = 1;
      while (i < points.length - 1 && source[i] < distance) i++;
      const span = source[i] - source[i - 1];
      const t = span > 0 ? (distance - source[i - 1]) / span : 0;
      return { point: { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t }, renderedProgress: (cumulative[i - 1] + (cumulative[i] - cumulative[i - 1]) * t) / length };
    },
  };
  return { lng, lat, zoom, journey };
}

export function terrainMapUrl(plan: NonNullable<ReturnType<typeof terrainMapPlan>>, token: string): string {
  const url = new URL(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${plan.lng},${plan.lat},${plan.zoom},0,0/540x960@2x`);
  url.searchParams.set('access_token', token);
  // Attribution is redrawn at readable size inside the social safe area.
  url.searchParams.set('attribution', 'false');
  return url.toString();
}
