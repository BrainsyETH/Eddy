// src/lib/release-timing/river.ts
// The White River below Bull Shoals Dam as the findings map draws it.
//
// ONLY THE GAUGE IS MEASURED. The study timed releases at one place, USGS
// 07057370 near Norfork, 41.5 river miles down. Everything this file computes
// between the dam and that gauge assumes the water moved at a steady pace, and
// the map labels it that way. Below the gauge Norfork Dam's own releases join
// the river, so no time is reported there at all.

import raw from '../../data/release-timing/white-river-map.json';

type LonLat = [number, number];
interface MapData {
  bbox: [number, number, number, number];
  /** One point every quarter mile from the dam: index = mile × 4. */
  white: LonLat[];
  norfork: LonLat[];
  tribs: Record<string, LonLat[]>;
  lakes: Record<string, LonLat[][]>;
}
export const MAP = raw as unknown as MapData;

export const GAUGE_MILE = 41.5;
const POINTS_PER_MILE = 4;

export interface Place {
  name: string;
  /** For narrow screens. */
  short?: string;
  mile: number;
  kind?: 'dam' | 'gauge';
  /** Small access points: drawn and selectable, labelled only when selected. */
  minor?: boolean;
  label?: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' };
  narrowLabel?: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' };
}

export const PLACES: Place[] = [
  { name: 'Bull Shoals Dam', mile: 0, kind: 'dam', label: { dx: 12, dy: 4, anchor: 'start' } },
  { name: 'State Park', mile: 1.4, minor: true },
  { name: 'Gaston’s', mile: 4.2, minor: true },
  { name: 'White Hole', mile: 7.1, label: { dx: 11, dy: 4, anchor: 'start' } },
  { name: 'The Narrows', mile: 9.1, minor: true },
  { name: 'Wildcat Shoals', mile: 10.8, label: { dx: -11, dy: 4, anchor: 'end' } },
  { name: 'Cotter', mile: 16.9, label: { dx: -11, dy: 4, anchor: 'end' } },
  { name: 'Roundhouse Shoals', mile: 17.6, minor: true },
  { name: 'Rim Shoals', mile: 21.3, label: { dx: 10, dy: -8, anchor: 'start' } },
  { name: 'Ranchette', mile: 26.4, minor: true },
  { name: 'Buffalo City', mile: 30.2, label: { dx: -11, dy: 14, anchor: 'end' } },
  { name: 'Cartney', mile: 34.4, minor: true },
  { name: 'Shipp’s Ferry', mile: 36.4, minor: true },
  { name: 'Gauge near Norfork', short: 'Gauge', mile: GAUGE_MILE, kind: 'gauge', label: { dx: -16, dy: -12, anchor: 'end' } },
  { name: 'Norfork', mile: 42.5, minor: true },
  { name: 'Red’s Landing', mile: 50, minor: true },
  { name: 'Sneed Creek', mile: 51.6, minor: true },
  { name: 'Chesmond Ferry', mile: 56.6, minor: true },
  { name: 'Calico Rock', mile: 60, label: { dx: 12, dy: 4, anchor: 'start' }, narrowLabel: { dx: 6, dy: 20, anchor: 'end' } },
];
export const GAUGE_INDEX = PLACES.findIndex((place) => place.kind === 'gauge');

/**
 * A place's share of the dam-to-gauge distance: the steady-pace assumption.
 * Null below the gauge, where no time is reported.
 */
export const paceShare = (place: Place): number | null => (place.mile <= GAUGE_MILE ? place.mile / GAUGE_MILE : null);

/** Where a release that took `hours` to the gauge would be after `elapsed` hours, at a steady pace. */
export const frontMile = (elapsed: number, hours: number): number => Math.min(GAUGE_MILE, (GAUGE_MILE * elapsed) / hours);

export interface RiverFrame {
  width: number;
  height: number;
  narrow: boolean;
  project(point: LonLat): [number, number];
  /** An SVG path through geographic points. */
  line(points: LonLat[]): string;
  /** The pixel position of a river mile. */
  at(mile: number): [number, number];
  /** An SVG path along the river between two miles; empty when they coincide. */
  slice(fromMile: number, toMile: number): string;
}

const fixed = (point: readonly number[]) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`;

export function riverFrame(width: number): RiverFrame {
  const [x0, y0, x1, y1] = MAP.bbox;
  const height = Math.round(width * ((y1 - y0) / ((x1 - x0) * Math.cos((((y0 + y1) / 2) * Math.PI) / 180))));
  const project = ([lon, lat]: LonLat): [number, number] => [((lon - x0) / (x1 - x0)) * width, ((y1 - lat) / (y1 - y0)) * height];
  const river = MAP.white.map(project);
  const last = river.length - 1;
  const at = (mile: number): [number, number] => {
    const f = Math.max(0, Math.min(last, mile * POINTS_PER_MILE));
    const i = Math.min(Math.floor(f), last - 1);
    const r = f - i;
    return [river[i][0] + (river[i + 1][0] - river[i][0]) * r, river[i][1] + (river[i + 1][1] - river[i][1]) * r];
  };
  return {
    width,
    height,
    narrow: width < 560,
    project,
    line: (points) => `M${points.map((point) => fixed(project(point))).join('L')}`,
    at,
    slice: (fromMile, toMile) => {
      if (toMile - fromMile < 0.02) return '';
      const out = [at(fromMile)];
      for (let i = Math.ceil(fromMile * POINTS_PER_MILE + 1e-6); i <= Math.floor(toMile * POINTS_PER_MILE - 1e-6); i++) out.push(river[i]);
      out.push(at(toMile));
      return `M${out.map(fixed).join('L')}`;
    },
  };
}
