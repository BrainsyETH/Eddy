// Shared WGS84 → SVG-viewBox projection for the Missouri surface-water
// visuals. Both the interactive map (MOMap) and the hero's river-network
// backdrop project the same geometry the same way, so the hero literally
// draws the same data the map does.

export const W = 1600;
export const H = 1000;
export const PADDING = 60;

export type Projector = (lon: number, lat: number) => [number, number];

export function buildProjector(bbox: {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}): Projector {
  const lonSpan = bbox.maxLon - bbox.minLon || 0.001;
  const latSpan = bbox.maxLat - bbox.minLat || 0.001;
  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  const innerW = W - 2 * PADDING;
  const innerH = H - 2 * PADDING;
  const scaleByLon = innerW / lonSpan;
  const scaleByLat = innerH / (latSpan / cosLat);
  const scale = Math.min(scaleByLon, scaleByLat);

  return (lon, lat) => {
    const x = (lon - centerLon) * scale + W / 2;
    const y = -(lat - centerLat) * (scale / cosLat) + H / 2;
    return [x, y];
  };
}

export function lineToPath(coords: Array<[number, number]>, project: Projector): string {
  if (!coords.length) return '';
  return coords
    .map(([lon, lat], i) => {
      const [x, y] = project(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function polygonToPath(coords: Array<[number, number]>, project: Projector): string {
  return lineToPath(coords, project) + ' Z';
}

/** Bounding box of a coordinate ring with a small percentage pad. */
export function bboxOf(coords: Array<[number, number]>, padRatio = 0.02) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const lonPad = (maxLon - minLon) * padRatio;
  const latPad = (maxLat - minLat) * padRatio;
  return {
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
  };
}
