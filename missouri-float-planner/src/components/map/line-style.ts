// src/components/map/line-style.ts
// Shared line treatment for river/route data layers: one width scale and
// one casing color, so the planner's route and the guide's condition-
// colored reach read as the same family of "Eddy data" lines everywhere.
//
// Widths interpolate across zoom (exponential 1.5 tracks how fast ground
// size shrinks per level) so lines stay readable from state framing (z7)
// to gravel-bar framing (z16) instead of going hairline or chunky.

import type maplibregl from 'maplibre-gl';

export const LINE_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.5], ['zoom'],
  7, 2,
  10, 3.5,
  13, 5.5,
  16, 8,
];

export const CASING_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.5], ['zoom'],
  7, 4,
  10, 6.5,
  13, 9,
  16, 12.5,
];

// Wide invisible companion drawn under the popup/cursor logic: a finger-
// friendly hit target for hover/click on a 2-8px line.
export const HIT_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.5], ['zoom'],
  7, 18,
  16, 34,
];

// Neutral casing: separates the line color from terrain/hillshade on the
// light curated style and stays crisp on satellite.
export const CASING_COLOR = 'rgba(255, 255, 255, 0.9)';
