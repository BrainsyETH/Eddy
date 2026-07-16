#!/usr/bin/env npx tsx
/**
 * Build public/map-styles/eddy-natural.json — Eddy's curated basemap style.
 *
 * Fetches the upstream OpenFreeMap "Liberty" style and applies a
 * deterministic transform, then writes the result as a static style JSON
 * that ships with the app (same bake-at-build philosophy as
 * scripts/build-mo-hillshade.ts: no runtime style patching, no flash of the
 * un-themed map, no dependency on upstream layer names at runtime).
 *
 * The transform implements three design rules, ported from the Missouri
 * Surface Water Observatory's look (src/components/mo-surface-water/):
 *
 * 1. WATER-FIRST HIERARCHY — every waterway, lake, and reservoir shifts to
 *    one coherent slate-teal family while land desaturates to warm
 *    neutrals. The state should read as a river network; Eddy's own data
 *    layers (condition-colored reaches, routes, markers) are the only
 *    saturated things on the map.
 *
 * 2. SUBTRACTION — POI symbols, airport/aeroway clutter, one-way arrows,
 *    and 3D buildings are hidden (visibility:none, so positions stay
 *    stable and they can be re-enabled at runtime if ever needed). Minor
 *    place labels gain a higher minzoom so state-level framing stays calm.
 *
 * 3. ANCHOR LAYERS — two zero-opacity `background` layers are baked into
 *    the layer stack as deterministic insertion slots for runtime layers
 *    (see src/components/map/layer-anchors.ts):
 *      · eddy-anchor-overlays — above water/land fills, below roads and
 *        labels. Rasters (hillshade, weather radar) insert here, so rain
 *        is visible over lakes but never covers a road or a town name.
 *      · eddy-anchor-lines — above all physical geometry, below every
 *        label. River/route lines insert here, so a route can never
 *        cover a town name (previously RouteLayer appended topmost).
 *
 * Sprite/glyph URLs stay absolute to tiles.openfreemap.org, so serving the
 * JSON from /public works unchanged.
 *
 * Run:   npx tsx scripts/build-map-style.ts
 * Output is committed; CI never needs the network.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SOURCE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OUT_PATH = join(process.cwd(), 'public', 'map-styles', 'eddy-natural.json');
const IMMERSIVE_OUT_PATH = join(process.cwd(), 'public', 'map-styles', 'eddy-immersive.json');

// Minimal style-spec typing — we only touch what we transform.
interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  minzoom?: number;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
}
interface StyleDoc {
  name?: string;
  metadata?: Record<string, unknown>;
  sources?: Record<string, Record<string, unknown>>;
  sprite?: unknown;
  glyphs?: unknown;
  layers: StyleLayer[];
  [key: string]: unknown;
}

// ── Rule 2: subtraction ─────────────────────────────────────────────────
// Hidden, not deleted: layer indexes stay stable and a runtime toggle
// could re-enable any of these without a style rebuild.
const HIDDEN_LAYER_IDS = new Set([
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
  'airport',
  'aeroway_fill',
  'aeroway_runway',
  'aeroway_taxiway',
  'road_one_way_arrow',
  'road_one_way_arrow_opposite',
  'highway-shield-non-us', // never renders in Missouri anyway
  'building-3d', // we never tilt the camera; extrusions are pure cost
]);

// Later-appearing minor labels: calmer state-level framing, unchanged
// close-up. (id → new minzoom; only ever raises, never lowers.)
// NOTE: label_village is deliberately NOT bumped — in the rural Ozarks
// the towns paddlers navigate by (Eminence, Van Buren, Birch Tree…) are
// OSM villages, and hiding them below z10 stripped every settlement name
// from a typical reach framing (z9–10).
const MINZOOM_BUMPS: Record<string, number> = {
  label_other: 10, // hamlets/suburbs/neighbourhoods
  road_shield_us: 10,
  building: 14,
};

// ── Rule 1: palette ─────────────────────────────────────────────────────
// Exact-match recolor of Liberty's stock values wherever they appear
// (fill-color, line-color, text-color, background-color). Liberty uses
// each literal consistently, so exact matching is deterministic. Values
// verified against the fetched style — if upstream renames a color the
// build script's post-transform audit below fails loudly.
const COLOR_MAP: Record<string, string> = {
  // Base + landcover → warm parchment neutrals (Observatory family)
  '#f8f4f0': '#f6f3ec', // background
  '#d8e8c8': '#dfe7d5', // park fill
  'rgba(228, 241, 215, 1)': 'rgba(215, 225, 204, 1)', // park outline
  'hsla(98,61%,72%,0.7)': 'hsla(98, 20%, 78%, 0.55)', // wood
  'rgba(176, 213, 154, 1)': 'rgba(203, 215, 191, 0.65)', // grass
  'rgba(247, 239, 195, 1)': 'rgba(240, 233, 208, 0.85)', // sand (gravel bars — keep visible, matter to paddlers)
  '#DEE3CD': '#e4e8db', // pitch/track
  'hsl(75,37%,81%)': 'hsl(75, 14%, 84%)', // cemetery
  '#fde': '#ece6e0', // hospital (was pink)
  'rgb(236,238,204)': '#eae9dd', // school
  'hsl(35,8%,85%)': 'hsl(35, 10%, 88%)', // building

  // Water → one slate-teal family (the hero layer)
  'rgb(158,189,255)': '#a9cede', // water fill (was bright blue)
  '#a0c8f0': '#7db4c9', // waterway lines (river/other/tunnel; tunnel re-tuned below)
  '#74aee9': '#4f8aa3', // waterway line labels
  '#495e91': '#3c6b80', // water name labels

  // Roads → recede to warm grays; hierarchy kept, orange killed
  '#e9ac77': '#d9d1c3', // major-road casings
  '#cfcdca': '#d6d3cd', // minor-road casings
  'hsl(36,6%,74%)': 'hsl(36, 8%, 78%)', // bridge street casing
  'hsl(35,6%,80%)': 'hsl(35, 8%, 83%)', // bridge path casing
  '#fc8': '#ede5d6', // motorway fill
  '#fea': '#f1ecdf', // trunk/primary/secondary fill
  '#fff4c6': '#f3efe4', // tunnel major fills
  '#ffdaa6': '#eae1d0', // tunnel motorway fill
  '#bbb': '#c8c4bc', // rail

  // Boundaries — soften county lines a touch
  'hsl(0,0%,70%)': 'hsl(0, 0%, 76%)',
};

// Per-layer paint overrides for values that aren't simple literals
// (zoom-interpolated colors), plus water-family fine-tuning.
const PAINT_OVERRIDES: Record<string, Record<string, unknown>> = {
  // Was: zoom-interpolated orange ramp. Flat muted tan; width expr kept.
  road_motorway: { 'line-color': '#e9e1d2' },
  // Was: zoom-interpolated pink/tan ramp. Flat warm wash for towns.
  landuse_residential: { 'fill-color': 'hsla(35, 12%, 88%, 0.6)' },
  // Water-family hierarchy: named rivers deepest, small streams a step
  // lighter, tunneled culverts lightest.
  waterway_river: { 'line-color': '#7db4c9' },
  waterway_other: { 'line-color': '#8fbfd1' },
  waterway_tunnel: { 'line-color': '#b9d4de' },
};

// Place labels get a slightly stronger halo so they stay legible over the
// runtime hillshade this style is designed to carry.
const PLACE_HALO = {
  'text-halo-color': 'rgba(255,255,255,0.95)',
  'text-halo-width': 1.4,
  'text-halo-blur': 1,
};

// ── Rule 3: anchors ─────────────────────────────────────────────────────
const ANCHOR_OVERLAYS = 'eddy-anchor-overlays';
const ANCHOR_LINES = 'eddy-anchor-lines';
// Anchor slots: overlays go right before aeroway_fill (first layer above
// the water fill); lines go right before waterway_line_label (the first
// label/symbol of the label block).
const OVERLAYS_BEFORE = 'aeroway_fill';
const LINES_BEFORE = 'waterway_line_label';

function anchorLayer(id: string): StyleLayer {
  // `background` needs no source and paints nothing at opacity 0 — the
  // cheapest valid placeholder the style spec allows.
  return { id, type: 'background', paint: { 'background-opacity': 0 } };
}

// ── Immersive style ─────────────────────────────────────────────────────
// The "PaddleWays look": ESRI World Imagery with luminous water veins and
// haloed labels drawn over it. Water here is neutral aqua CONTEXT — the
// live condition colors come from the app's condition layers on top
// (ConditionNetworkLayer / ConditionRiverLayer), which insert at the same
// baked anchors this style carries. Assembled from a hand-picked subset
// of Liberty's layers so widths/zoom behavior stay battle-tested.
function buildImmersive(original: StyleDoc): StyleDoc {
  const pick = (id: string): StyleLayer => {
    const layer = original.layers.find((l) => l.id === id);
    if (!layer) throw new Error(`immersive: liberty layer missing: ${id} — upstream style changed`);
    return JSON.parse(JSON.stringify(layer)) as StyleLayer;
  };
  const repaint = (layer: StyleLayer, paint: Record<string, unknown>): StyleLayer => {
    layer.paint = { ...(layer.paint ?? {}), ...paint };
    return layer;
  };

  const DARK_HALO = {
    'text-halo-color': 'rgba(9, 22, 28, 0.9)',
    'text-halo-width': 1.6,
    'text-halo-blur': 1,
  };
  const whiteLabel = (id: string, minzoom?: number): StyleLayer => {
    const l = repaint(pick(id), { 'text-color': '#ffffff', ...DARK_HALO });
    if (minzoom !== undefined) l.minzoom = Math.max(l.minzoom ?? 0, minzoom);
    return l;
  };

  const layers: StyleLayer[] = [
    // Dark base under the imagery while tiles stream in.
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1216' } },
    {
      id: 'esri-imagery',
      type: 'raster',
      source: 'esri-imagery',
      minzoom: 0,
      maxzoom: 22,
    },
    anchorLayer(ANCHOR_OVERLAYS),
    // Water context: translucent fill + aqua veins over the imagery.
    repaint(pick('water'), { 'fill-color': 'rgba(85, 176, 205, 0.38)' }),
    repaint(pick('waterway_river'), { 'line-color': '#59c5e3', 'line-opacity': 0.9 }),
    repaint(pick('waterway_other'), { 'line-color': '#6fd0ea', 'line-opacity': 0.85 }),
    // State/county lines for orientation over imagery.
    repaint(pick('boundary_3'), { 'line-color': 'rgba(255,255,255,0.35)' }),
    repaint(pick('boundary_2'), { 'line-color': 'rgba(255,255,255,0.5)' }),
    anchorLayer(ANCHOR_LINES),
    // Labels: water names in pale aqua, places in white, all dark-haloed.
    repaint(pick('waterway_line_label'), { 'text-color': '#c5ecf8', ...DARK_HALO }),
    repaint(pick('water_name_point_label'), { 'text-color': '#c5ecf8', ...DARK_HALO }),
    repaint(pick('water_name_line_label'), { 'text-color': '#c5ecf8', ...DARK_HALO }),
    whiteLabel('label_village'),
    whiteLabel('label_town'),
    whiteLabel('label_state'),
    whiteLabel('label_city'),
    whiteLabel('label_city_capital'),
    // Interstate/US shields for orientation (sprite-based, minzoom-bumped).
    (() => { const l = pick('highway-shield-us-interstate'); return l; })(),
    (() => { const l = pick('road_shield_us'); l.minzoom = Math.max(l.minzoom ?? 0, 10); return l; })(),
  ];

  const openmaptiles = original.sources?.openmaptiles;
  if (!openmaptiles) throw new Error('immersive: liberty openmaptiles source missing');

  return {
    version: 8,
    name: 'Eddy Immersive',
    metadata: {
      'eddy:generated-by': 'scripts/build-map-style.ts',
      'eddy:source': `${SOURCE_STYLE_URL} + ESRI World Imagery`,
    },
    sources: {
      'esri-imagery': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '&copy; Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
      },
      openmaptiles: JSON.parse(JSON.stringify(openmaptiles)),
    },
    sprite: original.sprite,
    glyphs: original.glyphs,
    layers,
  } as unknown as StyleDoc;
}

async function main() {
  console.log(`fetching ${SOURCE_STYLE_URL} …`);
  const res = await fetch(SOURCE_STYLE_URL);
  if (!res.ok) throw new Error(`style fetch → ${res.status}`);
  const style = (await res.json()) as StyleDoc;
  // Pristine copy for the immersive build — main() mutates `style` in place.
  const original = JSON.parse(JSON.stringify(style)) as StyleDoc;

  let recolored = 0;
  const colorProps = ['fill-color', 'line-color', 'background-color', 'text-color', 'fill-outline-color'];
  // Drift detection: every entry in our transform tables must actually hit
  // something in the upstream style, or the curation silently rots.
  const usedColors = new Set<string>();
  const usedOverrides = new Set<string>();
  const usedHidden = new Set<string>();

  for (const layer of style.layers) {
    // Subtraction
    if (HIDDEN_LAYER_IDS.has(layer.id)) {
      layer.layout = { ...(layer.layout ?? {}), visibility: 'none' };
      usedHidden.add(layer.id);
    }
    if (MINZOOM_BUMPS[layer.id] !== undefined) {
      layer.minzoom = Math.max(layer.minzoom ?? 0, MINZOOM_BUMPS[layer.id]);
    }

    // Palette
    if (layer.paint) {
      for (const prop of colorProps) {
        const v = layer.paint[prop];
        if (typeof v === 'string' && COLOR_MAP[v]) {
          usedColors.add(v);
          layer.paint[prop] = COLOR_MAP[v];
          recolored++;
        }
      }
    }
    const overrides = PAINT_OVERRIDES[layer.id];
    if (overrides) {
      layer.paint = { ...(layer.paint ?? {}), ...overrides };
      usedOverrides.add(layer.id);
      recolored++;
    }

    // Halos on place labels
    if (layer['source-layer'] === 'place' && layer.type === 'symbol') {
      layer.paint = { ...(layer.paint ?? {}), ...PLACE_HALO };
    }
  }

  // Anchors (idempotent: skip if re-run over an already-anchored doc)
  const insertBefore = (anchorId: string, beforeId: string) => {
    if (style.layers.some((l) => l.id === anchorId)) return;
    const idx = style.layers.findIndex((l) => l.id === beforeId);
    if (idx === -1) throw new Error(`anchor target "${beforeId}" not found — upstream style changed`);
    style.layers.splice(idx, 0, anchorLayer(anchorId));
  };
  insertBefore(ANCHOR_OVERLAYS, OVERLAYS_BEFORE);
  insertBefore(ANCHOR_LINES, LINES_BEFORE);

  // Drift audit: if upstream renames a literal or a layer id, the matching
  // transform entry stops hitting anything and the style would silently
  // ship half-themed. Fail loudly instead, listing exactly what drifted.
  const drift: string[] = [];
  for (const k of Object.keys(COLOR_MAP)) {
    if (!usedColors.has(k)) drift.push(`COLOR_MAP key never matched: ${k}`);
  }
  for (const id of Object.keys(PAINT_OVERRIDES)) {
    if (!usedOverrides.has(id)) drift.push(`PAINT_OVERRIDES layer missing: ${id}`);
  }
  for (const id of HIDDEN_LAYER_IDS) {
    if (!usedHidden.has(id)) drift.push(`HIDDEN layer missing: ${id}`);
  }
  if (drift.length) throw new Error(`upstream style drifted:\n${drift.join('\n')}`);

  style.name = 'Eddy Natural';
  style.metadata = {
    ...(style.metadata ?? {}),
    'eddy:generated-by': 'scripts/build-map-style.ts',
    'eddy:source': SOURCE_STYLE_URL,
  };

  mkdirSync(join(process.cwd(), 'public', 'map-styles'), { recursive: true });
  const out = JSON.stringify(style, null, 2);
  writeFileSync(OUT_PATH, out);
  console.log(
    `wrote ${OUT_PATH} (${(out.length / 1024).toFixed(0)} KB, ${style.layers.length} layers, ${recolored} paints recolored)`,
  );

  const immersive = buildImmersive(original);
  const immersiveOut = JSON.stringify(immersive, null, 2);
  writeFileSync(IMMERSIVE_OUT_PATH, immersiveOut);
  console.log(
    `wrote ${IMMERSIVE_OUT_PATH} (${(immersiveOut.length / 1024).toFixed(0)} KB, ${immersive.layers.length} layers)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
