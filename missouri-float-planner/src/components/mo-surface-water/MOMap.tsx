'use client';

import { useEffect, useRef, useMemo } from 'react';
import maplibregl, { type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MO_RIVERS,
  MO_CITIES,
  MO_STATE_OUTLINE,
  MO_FLOATER,
  STAGE_VERDICTS,
  stageToVerdict,
  PERCENTILE_CLASSES,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';

interface MOMapProps {
  gauges: MoStatewideGauge[];
  hoveredRiverId: string | null;
  focusedRiverId: string | null;
  hoveredGaugeId: string | null;
  focusedGaugeId: string | null;
  onHoverRiver: (id: string | null) => void;
  onFocusRiver: (id: string | null) => void;
  onHoverGauge: (id: string | null) => void;
  onFocusGauge: (id: string | null) => void;
}

// Empty MapLibre style — we render every visual layer ourselves so there's no
// external tile dependency. The "background" layer paints the off-map area
// the dark earthy color the prototype uses.
const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1F1A14' },
    },
  ],
};

// Stops for percentile → color, fed straight into MapLibre's interpolate
// expression so the GPU does the gradient. Matches PERCENTILE_CLASSES bands.
const PERCENTILE_COLOR_EXPR: ExpressionSpecification = [
  'case',
  ['==', ['feature-state', 'percentile'], null],
  '#6B6459',
  [
    'interpolate',
    ['linear'],
    ['to-number', ['feature-state', 'percentile']],
    0,  PERCENTILE_CLASSES[0].color,
    10, PERCENTILE_CLASSES[0].color,
    11, PERCENTILE_CLASSES[1].color,
    25, PERCENTILE_CLASSES[1].color,
    26, PERCENTILE_CLASSES[2].color,
    75, PERCENTILE_CLASSES[2].color,
    76, PERCENTILE_CLASSES[3].color,
    90, PERCENTILE_CLASSES[3].color,
    91, PERCENTILE_CLASSES[4].color,
    100, PERCENTILE_CLASSES[4].color,
  ],
];

const FLOATER_INNER_EXPR: ExpressionSpecification = [
  'match',
  ['get', 'verdict'],
  'bony',   STAGE_VERDICTS.bony.inner,
  'prime',  STAGE_VERDICTS.prime.inner,
  'pushy',  STAGE_VERDICTS.pushy.inner,
  'hazard', STAGE_VERDICTS.hazard.inner,
  'transparent',
];

export default function MOMap(props: MOMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dashFrameRef = useRef<number>(0);

  // Per-river snapshot derived from gauges (mean percentile + verdict).
  const riverSnapshot = useMemo(() => {
    const byRiver = new Map<string, MoStatewideGauge[]>();
    for (const g of props.gauges) {
      const arr = byRiver.get(g.river_id);
      if (arr) arr.push(g); else byRiver.set(g.river_id, [g]);
    }
    const out: Record<string, { percentile: number | null; verdict: string }> = {};
    for (const r of MO_RIVERS) {
      const list = byRiver.get(r.id) ?? [];
      const pcts = list.map((g) => g.percentile).filter((p): p is number => p != null);
      const meanP = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;

      const fp = MO_FLOATER[r.id];
      let verdict = 'unknown';
      if (fp) {
        // Use the first gauge with a valid stage as the canonical reading.
        const stage = list.find((g) => g.gaugeHeightFt != null)?.gaugeHeightFt ?? null;
        verdict = stageToVerdict(stage, fp.stageBands);
      }
      out[r.id] = { percentile: meanP, verdict };
    }
    return out;
  }, [props.gauges]);

  // ──────────────────────────────────────────────────────────────────────
  // Initialize the map exactly once
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [-92.5, 38.4],
      zoom: 6.1,
      minZoom: 5.5,
      maxZoom: 10,
      attributionControl: false,
      // Restrict to roughly Missouri + a buffer so the user can't pan into the void.
      maxBounds: [[-97.5, 35.0], [-87.5, 41.5]],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'USGS NWIS · Geometry hand-traced from USGS NHD',
      }),
      'bottom-right',
    );

    map.on('load', () => {
      // ─── State silhouette ──────────────────────────────────────
      map.addSource('mo-state', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: MO_STATE_OUTLINE },
      });
      map.addLayer({
        id: 'mo-state-fill',
        type: 'fill',
        source: 'mo-state',
        paint: {
          'fill-color': '#E6DCBE',
          'fill-opacity': 0.94,
        },
      });
      map.addLayer({
        id: 'mo-state-grain',
        type: 'fill',
        source: 'mo-state',
        paint: {
          // Subtle inner shading via radial-gradient-style overlay.
          'fill-color': '#C9B98E',
          'fill-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'mo-state-outline',
        type: 'line',
        source: 'mo-state',
        paint: {
          'line-color': 'rgba(80,60,30,0.6)',
          'line-width': 2,
        },
      });

      // ─── Rivers ────────────────────────────────────────────────
      const riverFeatures: GeoJSON.Feature[] = MO_RIVERS.map((r) => ({
        type: 'Feature',
        id: idToNumeric(r.id),
        properties: {
          riverId: r.id,
          name: r.name,
          basin: r.basin,
          order: r.order,
          floatable: r.id in MO_FLOATER,
          verdict: 'unknown',
        },
        geometry: { type: 'LineString', coordinates: r.coordinates },
      }));
      map.addSource('mo-rivers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: riverFeatures },
        promoteId: 'riverId',
      });

      const orderWidth: ExpressionSpecification = [
        'interpolate',
        ['linear'],
        ['get', 'order'],
        4, 1.5,
        5, 2.2,
        6, 3.0,
        7, 4.0,
        8, 5.0,
      ];

      const hoverWidthBoost: ExpressionSpecification = [
        'case',
        ['boolean', ['feature-state', 'hovered'], false],
        2.5,
        ['boolean', ['feature-state', 'focused'], false],
        2.5,
        0,
      ];

      // Invisible thick hit-target layer for easier hover/click on thin reaches.
      map.addLayer({
        id: 'mo-river-hit',
        type: 'line',
        source: 'mo-rivers',
        paint: {
          'line-color': 'transparent',
          'line-width': 16,
        },
      });

      // Glow under hovered/focused rivers.
      map.addLayer({
        id: 'mo-river-glow',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PERCENTILE_COLOR_EXPR,
          'line-blur': 4,
          'line-width': ['+', orderWidth, 5],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 0.45,
            ['boolean', ['feature-state', 'focused'], false], 0.55,
            0,
          ],
        },
      });

      map.addLayer({
        id: 'mo-river-line',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PERCENTILE_COLOR_EXPR,
          'line-width': ['+', orderWidth, hoverWidthBoost],
          'line-opacity': [
            'case',
            // dim non-focused rivers when something is focused
            [
              'all',
              ['!=', ['feature-state', 'focused'], null],
              ['!', ['boolean', ['feature-state', 'focused'], false]],
            ],
            0.22,
            // dim non-hovered when hovering
            [
              'all',
              ['!=', ['feature-state', 'hovered'], null],
              ['!', ['boolean', ['feature-state', 'hovered'], false]],
              ['!', ['boolean', ['feature-state', 'focused'], false]],
            ],
            0.32,
            1.0,
          ],
        },
      });

      // Floater inner stroke (parallel inset, dashed when hazard).
      map.addLayer({
        id: 'mo-river-floater',
        type: 'line',
        source: 'mo-rivers',
        filter: ['==', ['get', 'floatable'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': FLOATER_INNER_EXPR,
          'line-width': ['*', orderWidth, 0.45],
          'line-dasharray': [
            'match',
            ['get', 'verdict'],
            'hazard', ['literal', [2, 2]],
            ['literal', [1, 0]],
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'verdict'], 'unknown'], 0,
            0.95,
          ],
        },
      });

      // Animated dasharray on a clone of the river-line for "particle"
      // movement on percentile ≥ 60 reaches. We update the offset via a RAF
      // loop below.
      map.addLayer({
        id: 'mo-river-flow',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['*', orderWidth, 0.35],
          'line-opacity': [
            'case',
            ['<', ['to-number', ['feature-state', 'percentile']], 60], 0,
            0.55,
          ],
          'line-dasharray': [0.3, 4],
        },
      });

      // ─── Gauges ────────────────────────────────────────────────
      const gaugeFeatures: GeoJSON.Feature[] = MO_RIVERS.flatMap((r) =>
        r.gauges.map((g) => ({
          type: 'Feature' as const,
          id: hash(g.site_no),
          properties: {
            site_no: g.site_no,
            site_name: g.name,
            riverId: r.id,
            riverName: r.name,
            basin: r.basin,
            order: r.order,
            percentile: null,
            isPeak: false,
          },
          geometry: { type: 'Point' as const, coordinates: [g.lon, g.lat] },
        })),
      );
      map.addSource('mo-gauges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: gaugeFeatures },
        promoteId: 'site_no',
      });

      // Outer pulse for above-P75 gauges (rising/peak).
      map.addLayer({
        id: 'mo-gauge-pulse',
        type: 'circle',
        source: 'mo-gauges',
        paint: {
          'circle-radius': 12,
          'circle-color': PERCENTILE_COLOR_EXPR,
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'isPeak'], false], 0.18,
            0,
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': PERCENTILE_COLOR_EXPR,
          'circle-stroke-opacity': [
            'case',
            ['boolean', ['feature-state', 'isPeak'], false], 0.35,
            0,
          ],
        },
      });

      map.addLayer({
        id: 'mo-gauge-dot',
        type: 'circle',
        source: 'mo-gauges',
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 6,
            ['boolean', ['feature-state', 'focused'], false], 7,
            3.5,
          ],
          'circle-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-stroke-color': PERCENTILE_COLOR_EXPR,
        },
      });

      // ─── Cities ────────────────────────────────────────────────
      const cityFeatures: GeoJSON.Feature[] = MO_CITIES.map((c) => ({
        type: 'Feature',
        properties: { name: c.name, type: c.type },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      }));
      map.addSource('mo-cities', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: cityFeatures },
      });
      map.addLayer({
        id: 'mo-city-dot',
        type: 'circle',
        source: 'mo-cities',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'type'], 'metro'], 4, 2.5],
          'circle-color': 'rgba(45,42,36,0.7)',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(247,246,243,0.85)',
        },
      });
      map.addLayer({
        id: 'mo-city-label',
        type: 'symbol',
        source: 'mo-cities',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['case', ['==', ['get', 'type'], 'metro'], 12, 10.5],
          'text-offset': [0.9, 0],
          'text-anchor': 'left',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(45,42,36,0.85)',
          'text-halo-color': 'rgba(242,234,216,0.95)',
          'text-halo-width': 2,
        },
      });

      // ─── River labels ──────────────────────────────────────────
      const riverLabelFeatures: GeoJSON.Feature[] = MO_RIVERS
        .filter((r) => r.order >= 5)
        .map((r) => {
          const mid = r.coordinates[Math.floor(r.coordinates.length / 2)];
          return {
            type: 'Feature',
            properties: {
              name: r.name.replace(' River', '').replace(' Creek', ' Cr.'),
              order: r.order,
            },
            geometry: { type: 'Point', coordinates: mid },
          };
        });
      map.addSource('mo-river-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: riverLabelFeatures },
      });
      map.addLayer({
        id: 'mo-river-label',
        type: 'symbol',
        source: 'mo-river-labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['+', 7, ['get', 'order']],
          'text-letter-spacing': 0.04,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(20,24,30,0.85)',
          'text-halo-color': 'rgba(242,234,216,0.92)',
          'text-halo-width': 3,
        },
      });

      // ─── Interaction wiring ────────────────────────────────────
      const moveCursor = (cursor: string) => () => {
        map.getCanvas().style.cursor = cursor;
      };

      map.on('mouseenter', 'mo-river-hit', moveCursor('pointer'));
      map.on('mouseleave', 'mo-river-hit', moveCursor(''));
      let lastRiverId: string | null = null;
      map.on('mousemove', 'mo-river-hit', (e) => {
        const feat = e.features?.[0];
        const id = feat?.properties?.riverId as string | undefined;
        if (id && id !== lastRiverId) {
          lastRiverId = id;
          props.onHoverRiver(id);
        }
      });
      map.on('mouseleave', 'mo-river-hit', () => {
        lastRiverId = null;
        props.onHoverRiver(null);
      });
      map.on('click', 'mo-river-hit', (e) => {
        const feat = e.features?.[0];
        const id = feat?.properties?.riverId as string | undefined;
        if (id) props.onFocusRiver(id);
      });

      map.on('mouseenter', 'mo-gauge-dot', moveCursor('pointer'));
      map.on('mouseleave', 'mo-gauge-dot', moveCursor(''));
      let lastGaugeId: string | null = null;
      map.on('mousemove', 'mo-gauge-dot', (e) => {
        const feat = e.features?.[0];
        const id = feat?.properties?.site_no as string | undefined;
        if (id && id !== lastGaugeId) {
          lastGaugeId = id;
          props.onHoverGauge(id);
        }
      });
      map.on('mouseleave', 'mo-gauge-dot', () => {
        lastGaugeId = null;
        props.onHoverGauge(null);
      });
      map.on('click', 'mo-gauge-dot', (e) => {
        e.preventDefault();
        const feat = e.features?.[0];
        const id = feat?.properties?.site_no as string | undefined;
        if (id) props.onFocusGauge(id);
      });

      // Click on empty map = clear focus.
      map.on('click', (e) => {
        if (e.defaultPrevented) return;
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ['mo-river-hit', 'mo-gauge-dot'],
        });
        if (hits.length === 0) {
          props.onFocusRiver(null);
          props.onFocusGauge(null);
        }
      });

      // ─── Animated flow particles via dasharray offset ──────────
      let frame = 0;
      const tick = () => {
        frame = (frame + 1) % 4000;
        const offset = (frame % 24) / 24;
        try {
          map.setPaintProperty('mo-river-flow', 'line-dasharray', [
            0.3,
            4,
            // The third value forms an offset — MapLibre accepts arbitrary
            // dasharray length. We push the gap forward each frame by a small
            // delta to simulate motion; spec requires the array re-set.
          ]);
          // Use line-translate as the actual motion driver — dasharray alone
          // can't animate without redraw, but translating along the line gives
          // the eye a moving texture under the line stroke. Subtle on purpose.
          const dx = Math.cos(offset * Math.PI * 2) * 0.5;
          const dy = Math.sin(offset * Math.PI * 2) * 0.5;
          map.setPaintProperty('mo-river-flow', 'line-translate', [dx, dy]);
        } catch {
          // Style may have torn down during HMR — abort silently.
        }
        dashFrameRef.current = requestAnimationFrame(tick);
      };
      dashFrameRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(dashFrameRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // Push gauge readings + river snapshot into feature-state
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // River feature-state by mean percentile + verdict.
      for (const r of MO_RIVERS) {
        const snap = riverSnapshot[r.id];
        map.setFeatureState(
          { source: 'mo-rivers', id: r.id },
          { percentile: snap?.percentile ?? null },
        );
      }
      // The verdict is a *property*, not feature-state — we re-set the source
      // data with updated verdict per feature so the floater layer paints.
      const src = map.getSource('mo-rivers') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: MO_RIVERS.map((r) => ({
            type: 'Feature',
            id: r.id,
            properties: {
              riverId: r.id,
              name: r.name,
              basin: r.basin,
              order: r.order,
              floatable: r.id in MO_FLOATER,
              verdict: riverSnapshot[r.id]?.verdict ?? 'unknown',
            },
            geometry: { type: 'LineString', coordinates: r.coordinates },
          })),
        });
      }
      // Gauge feature-state.
      for (const g of props.gauges) {
        map.setFeatureState(
          { source: 'mo-gauges', id: g.site_no },
          {
            percentile: g.percentile,
            isPeak: g.percentile != null && g.percentile >= 75,
          },
        );
      }
    };
    if (map.isStyleLoaded() && map.getSource('mo-rivers')) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [props.gauges, riverSnapshot]);

  // ──────────────────────────────────────────────────────────────────────
  // Hover / focus state from React → feature-state
  // ──────────────────────────────────────────────────────────────────────
  const prevState = useRef({
    hoveredRiver: null as string | null,
    focusedRiver: null as string | null,
    hoveredGauge: null as string | null,
    focusedGauge: null as string | null,
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource('mo-rivers')) return;

    const setRiver = (id: string | null, key: 'hovered' | 'focused', val: boolean) => {
      if (!id) return;
      map.setFeatureState({ source: 'mo-rivers', id }, { [key]: val });
    };
    const setGauge = (id: string | null, key: 'hovered' | 'focused', val: boolean) => {
      if (!id) return;
      map.setFeatureState({ source: 'mo-gauges', id }, { [key]: val });
    };

    const p = prevState.current;
    if (p.hoveredRiver !== props.hoveredRiverId) {
      setRiver(p.hoveredRiver, 'hovered', false);
      setRiver(props.hoveredRiverId, 'hovered', true);
      p.hoveredRiver = props.hoveredRiverId;
    }
    if (p.focusedRiver !== props.focusedRiverId) {
      setRiver(p.focusedRiver, 'focused', false);
      setRiver(props.focusedRiverId, 'focused', true);
      p.focusedRiver = props.focusedRiverId;
    }
    if (p.hoveredGauge !== props.hoveredGaugeId) {
      setGauge(p.hoveredGauge, 'hovered', false);
      setGauge(props.hoveredGaugeId, 'hovered', true);
      p.hoveredGauge = props.hoveredGaugeId;
    }
    if (p.focusedGauge !== props.focusedGaugeId) {
      setGauge(p.focusedGauge, 'focused', false);
      setGauge(props.focusedGaugeId, 'focused', true);
      p.focusedGauge = props.focusedGaugeId;
    }
  }, [
    props.hoveredRiverId,
    props.focusedRiverId,
    props.hoveredGaugeId,
    props.focusedGaugeId,
  ]);

  return <div ref={containerRef} className="h-full w-full" />;
}

// MapLibre's promoteId path won't accept arbitrary string IDs as feature IDs
// for setFeatureState; it needs them stable across data updates. We set
// `id: r.id` directly on the feature so promoteId is unnecessary; this hash
// is only used for gauges where we want a numeric fallback if needed.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function idToNumeric(id: string): string {
  // Returning the slug as-is is fine; MapLibre accepts string IDs in
  // feature-state when the id is set directly on the GeoJSON Feature.
  return id;
}
