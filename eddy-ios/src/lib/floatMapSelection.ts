import { validCoordinate } from './floatRawFix';
import type { LngLat } from '@eddy/geo';
export interface FloatMapChoice { id: string; title: string; detail: string; point: LngLat; mile: number | null; endpoint: boolean }
export const FLOAT_HIT_SIZE = 56;
export function floatTapRect(x: number, y: number): [number, number, number, number] {
  const half = FLOAT_HIT_SIZE / 2;
  return [y - half, x - half, y + half, x + half];
}
export function floatMapChoices(features: readonly { properties?: Record<string, unknown> | null; geometry?: { coordinates?: unknown } }[]): FloatMapChoice[] {
  const choices = new Map<string, FloatMapChoice>();
  for (const feature of features) {
    const p = feature.properties;
    const point = feature.geometry?.coordinates;
    if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || !validCoordinate(point)) continue;
    choices.set(p.id, { id: p.id, title: p.title, detail: typeof p.sub === 'string' ? p.sub : '', point,
      mile: typeof p.mile === 'number' && p.mile >= 0 ? p.mile : null, endpoint: p.end === 'start' || p.end === 'take-out' });
  }
  return [...choices.values()].sort((a, b) => Number(b.endpoint) - Number(a.endpoint) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
