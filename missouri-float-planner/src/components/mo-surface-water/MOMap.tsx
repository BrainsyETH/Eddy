'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  PERCENTILE_CLASSES,
  STAGE_VERDICTS,
  THEME,
  type MORiver,
  type MOCampground,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';

interface MOMapProps {
  rivers: MORiver[];
  campgrounds: MOCampground[];
  gauges: MoStatewideGauge[];
  /** verdict per river slug, computed by parent against scrubbed day */
  verdictByRiver: Record<string, StageVerdict>;
  /** percentile per river slug, scrubbed-day aware */
  percentileByRiver: Record<string, number | null>;
  /** percentile per gauge site_no, scrubbed-day aware */
  percentileByGauge: Record<string, number | null>;
  hoveredRiverId: string | null;
  focusedRiverId: string | null;
  hoveredGaugeId: string | null;
  focusedGaugeId: string | null;
  showCampgrounds: boolean;
  showAccessPoints: boolean;
  showPOIs: boolean;
  onHoverRiver: (id: string | null) => void;
  onFocusRiver: (id: string | null) => void;
  onHoverGauge: (id: string | null) => void;
  onFocusGauge: (id: string | null) => void;
  onClickCampground: (id: string | null) => void;
  onClickAccessPoint: (id: string | null) => void;
  onClickPoi: (id: string | null) => void;
}

// OpenFreeMap "Liberty" — same basemap the rest of Eddy uses. No API key.
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const PERCENTILE_COLOR_EXPR: ExpressionSpecification = [
  'case',
  ['==', ['feature-state', 'percentile'], null],
  '#857D70',
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

const VERDICT_COLOR_EXPR: ExpressionSpecification = [
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layersReady, setLayersReady] = useState(false);

  // Particles for animated flow.
  const particlesRef = useRef<
    Array<{ riverId: string; t: number; speed: number; trail: Array<{ x: number; y: number }> }>
  >([]);
  const rafRef = useRef<number>(0);

  // ──────────────────────────────────────────────────────────────────────
  // Initialize the map once
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      center: [-91.4, 37.6],
      zoom: 7.1,
      minZoom: 6,
      maxZoom: 12,
      attributionControl: false,
      maxBounds: [[-97.5, 35.0], [-87.5, 41.5]],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'USGS NWIS · NPS · Eddy data',
      }),
      'bottom-right',
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      // ─── State silhouette (stylized, just for compositional contrast) ─
      // We rely on rivers themselves; no state polygon needed at zoom 7+.

      // ─── Rivers ────────────────────────────────────────────────
      map.addSource('mo-rivers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'riverId',
      });

      const orderWidth: ExpressionSpecification = [
        'interpolate',
        ['linear'],
        ['zoom'],
        6, 1.5,
        8, 3,
        10, 5,
        12, 8,
      ];

      // Hit target — invisible thick stroke for easier hover/click
      map.addLayer({
        id: 'mo-river-hit',
        type: 'line',
        source: 'mo-rivers',
        paint: { 'line-color': 'transparent', 'line-width': 18 },
      });

      // Casing — slight halo so rivers pop off the dark bg
      map.addLayer({
        id: 'mo-river-casing',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0F2D35',
          'line-width': ['+', orderWidth, 4],
          'line-opacity': 0.55,
        },
      });

      // Glow on hover/focus
      map.addLayer({
        id: 'mo-river-glow',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PERCENTILE_COLOR_EXPR,
          'line-blur': 5,
          'line-width': ['+', orderWidth, 8],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 0.55,
            ['boolean', ['feature-state', 'focused'], false], 0.7,
            0,
          ],
        },
      });

      // Main river stroke colored by percentile
      map.addLayer({
        id: 'mo-river-line',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PERCENTILE_COLOR_EXPR,
          'line-width': ['+', orderWidth, [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 1.5,
            ['boolean', ['feature-state', 'focused'], false], 2,
            0,
          ]],
          'line-opacity': [
            'case',
            ['all',
              ['!=', ['feature-state', 'focused'], null],
              ['!', ['boolean', ['feature-state', 'focused'], false]],
            ],
            0.28,
            ['all',
              ['!=', ['feature-state', 'hovered'], null],
              ['!', ['boolean', ['feature-state', 'hovered'], false]],
              ['!', ['boolean', ['feature-state', 'focused'], false]],
            ],
            0.42,
            1.0,
          ],
        },
      });

      // Floater inner stroke (verdict-colored parallel line)
      map.addLayer({
        id: 'mo-river-verdict',
        type: 'line',
        source: 'mo-rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': VERDICT_COLOR_EXPR,
          'line-width': ['*', orderWidth, 0.4],
          'line-opacity': [
            'case',
            ['==', ['get', 'verdict'], 'unknown'], 0,
            0.95,
          ],
          'line-dasharray': [
            'match',
            ['get', 'verdict'],
            'hazard', ['literal', [2, 2]],
            ['literal', [1, 0]],
          ],
        },
      });

      // ─── River labels ──────────────────────────────────────────
      map.addSource('mo-river-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'mo-river-label',
        type: 'symbol',
        source: 'mo-river-labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-letter-spacing': 0.05,
          'symbol-placement': 'line',
          'text-allow-overlap': false,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#0F2D35',
          'text-halo-color': '#FAF8F4',
          'text-halo-width': 2.5,
        },
      });

      // ─── Campgrounds ──────────────────────────────────────────
      map.addSource('mo-campgrounds', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });
      map.addLayer({
        id: 'mo-campground-dot',
        type: 'circle',
        source: 'mo-campgrounds',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'total_sites'],
            0, 4, 50, 7, 150, 10,
          ],
          'circle-color': '#7A684B',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F2EAD8',
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'mo-campground-icon',
        type: 'symbol',
        source: 'mo-campgrounds',
        layout: {
          'text-field': '⛺',
          'text-size': 11,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#FAF8F4',
          'text-halo-color': '#3D3425',
          'text-halo-width': 0.6,
        },
      });

      // ─── Access points ────────────────────────────────────────
      map.addSource('mo-access', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });
      map.addLayer({
        id: 'mo-access-dot',
        type: 'circle',
        source: 'mo-access',
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 6,
            4,
          ],
          'circle-color': ['get', 'fill'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#F2EAD8',
        },
      });

      // ─── POIs (springs, caves, waterfalls) ───────────────────
      map.addSource('mo-pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });
      map.addLayer({
        id: 'mo-poi-glyph',
        type: 'symbol',
        source: 'mo-pois',
        layout: {
          'text-field': ['get', 'glyph'],
          'text-size': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false], 18,
            14,
          ],
          'text-allow-overlap': true,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': ['get', 'tone'],
          'text-halo-color': '#FAF8F4',
          'text-halo-width': 1.8,
        },
      });

      // ─── Gauges ────────────────────────────────────────────────
      map.addSource('mo-gauges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'site_no',
      });

      // Pulse for above-P75 gauges
      map.addLayer({
        id: 'mo-gauge-pulse',
        type: 'circle',
        source: 'mo-gauges',
        paint: {
          'circle-radius': 16,
          'circle-color': PERCENTILE_COLOR_EXPR,
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'isPeak'], false], 0.18,
            0,
          ],
          'circle-blur': 0.4,
        },
      });

      map.addLayer({
        id: 'mo-gauge-dot',
        type: 'circle',
        source: 'mo-gauges',
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'focused'], false], 8,
            ['boolean', ['feature-state', 'hovered'], false], 7,
            ['boolean', ['get', 'is_primary'], false], 6,
            4,
          ],
          'circle-color': '#F2EAD8',
          'circle-stroke-width': [
            'case',
            ['boolean', ['get', 'is_primary'], false], 2.5,
            1.8,
          ],
          'circle-stroke-color': PERCENTILE_COLOR_EXPR,
        },
      });

      // ─── Interaction ──────────────────────────────────────────
      const cursorTo = (cursor: string) => () => {
        map.getCanvas().style.cursor = cursor;
      };
      ['mo-river-hit', 'mo-gauge-dot', 'mo-campground-dot', 'mo-access-dot', 'mo-poi-glyph'].forEach(
        (id) => {
          map.on('mouseenter', id, cursorTo('pointer'));
          map.on('mouseleave', id, cursorTo(''));
        },
      );

      // River hover/click
      let lastRiver: string | null = null;
      map.on('mousemove', 'mo-river-hit', (e) => {
        const id = e.features?.[0]?.properties?.riverId as string | undefined;
        if (id && id !== lastRiver) {
          lastRiver = id;
          props.onHoverRiver(id);
        }
      });
      map.on('mouseleave', 'mo-river-hit', () => {
        lastRiver = null;
        props.onHoverRiver(null);
      });
      map.on('click', 'mo-river-hit', (e) => {
        const id = e.features?.[0]?.properties?.riverId as string | undefined;
        if (id) {
          e.preventDefault();
          props.onFocusRiver(id);
        }
      });

      // Gauge hover/click
      map.on('mousemove', 'mo-gauge-dot', (e) => {
        const id = e.features?.[0]?.properties?.site_no as string | undefined;
        if (id) props.onHoverGauge(id);
      });
      map.on('mouseleave', 'mo-gauge-dot', () => props.onHoverGauge(null));
      map.on('click', 'mo-gauge-dot', (e) => {
        const id = e.features?.[0]?.properties?.site_no as string | undefined;
        if (id) {
          e.preventDefault();
          props.onFocusGauge(id);
        }
      });

      // Campground / access / poi click
      map.on('click', 'mo-campground-dot', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) {
          e.preventDefault();
          props.onClickCampground(id);
        }
      });
      map.on('click', 'mo-access-dot', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) {
          e.preventDefault();
          props.onClickAccessPoint(id);
        }
      });
      map.on('click', 'mo-poi-glyph', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) {
          e.preventDefault();
          props.onClickPoi(id);
        }
      });

      // Empty-map click clears focus
      map.on('click', (e) => {
        if (e.defaultPrevented) return;
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ['mo-river-hit', 'mo-gauge-dot', 'mo-campground-dot', 'mo-access-dot', 'mo-poi-glyph'],
        });
        if (!hits.length) {
          props.onFocusRiver(null);
          props.onFocusGauge(null);
          props.onClickCampground(null);
          props.onClickAccessPoint(null);
          props.onClickPoi(null);
        }
      });

      setLayersReady(true);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // Push river geometry into the map when it changes
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    const features: GeoJSON.Feature[] = props.rivers.map((r) => ({
      type: 'Feature',
      id: r.id,
      properties: {
        riverId: r.id,
        slug: r.slug,
        name: r.name,
        verdict: props.verdictByRiver[r.slug] ?? 'unknown',
        length: r.length_miles ?? 0,
      },
      geometry: r.geometry,
    }));

    (map.getSource('mo-rivers') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });

    (map.getSource('mo-river-labels') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: features.map((f) => ({
        ...f,
        id: undefined,
        properties: { name: (f.properties as { name: string }).name },
      })),
    });

    // Push percentile feature-state per river
    for (const r of props.rivers) {
      map.setFeatureState(
        { source: 'mo-rivers', id: r.id },
        { percentile: props.percentileByRiver[r.slug] ?? null },
      );
    }
  }, [props.rivers, props.verdictByRiver, props.percentileByRiver, layersReady]);

  // ──────────────────────────────────────────────────────────────────────
  // Push gauges, campgrounds, access points, POIs into their sources
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    const gaugeFeatures: GeoJSON.Feature[] = props.rivers.flatMap((r) =>
      (r.gauges ?? []).map((g) => ({
        type: 'Feature' as const,
        id: g.site_id,
        properties: {
          site_no: g.site_id,
          name: g.name,
          riverId: r.id,
          slug: r.slug,
          is_primary: g.is_primary,
        },
        geometry: { type: 'Point', coordinates: [g.lon, g.lat] },
      })),
    );
    (map.getSource('mo-gauges') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: gaugeFeatures,
    });

    const campFeatures: GeoJSON.Feature[] = props.campgrounds.map((c) => ({
      type: 'Feature',
      id: c.id,
      properties: {
        id: c.id,
        name: c.name,
        total_sites: c.total_sites ?? 0,
      },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    }));
    (map.getSource('mo-campgrounds') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: props.showCampgrounds ? campFeatures : [],
    });

    // Access points (color by type)
    const accessFeatures: GeoJSON.Feature[] = props.rivers.flatMap((r) =>
      (r.access_points ?? []).map((a) => {
        const fill = '#4EB86B';
        return {
          type: 'Feature' as const,
          id: a.id,
          properties: {
            id: a.id,
            name: a.name,
            riverId: r.id,
            slug: r.slug,
            type: a.type,
            ownership: a.ownership,
            fill,
          },
          geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        };
      }),
    );
    (map.getSource('mo-access') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: props.showAccessPoints ? accessFeatures : [],
    });

    // POIs
    const poiGlyphMap: Record<string, string> = {
      spring: '◉', cave: '⌬', historical_site: '◈',
      scenic_viewpoint: '▲', waterfall: '≋', geological: '◆', other: '◉',
    };
    const poiToneMap: Record<string, string> = {
      spring: '#1D525F', cave: '#3D3425', historical_site: '#7A684B',
      scenic_viewpoint: '#347A47', waterfall: '#256574', geological: '#5C4E38', other: '#524D43',
    };
    const poiFeatures: GeoJSON.Feature[] = props.rivers.flatMap((r) =>
      (r.pois ?? []).map((p) => ({
        type: 'Feature' as const,
        id: p.id,
        properties: {
          id: p.id,
          name: p.name,
          type: p.type,
          glyph: poiGlyphMap[p.type] ?? '◉',
          tone: poiToneMap[p.type] ?? '#F4EFE7',
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    );
    (map.getSource('mo-pois') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: props.showPOIs ? poiFeatures : [],
    });

    // Push gauge feature state (percentile + isPeak)
    for (const g of props.gauges) {
      const p = props.percentileByGauge[g.site_no] ?? g.percentile;
      map.setFeatureState(
        { source: 'mo-gauges', id: g.site_no },
        {
          percentile: p,
          isPeak: p != null && p >= 75,
        },
      );
    }
  }, [
    props.rivers, props.campgrounds, props.gauges,
    props.showCampgrounds, props.showAccessPoints, props.showPOIs,
    props.percentileByGauge, layersReady,
  ]);

  // ──────────────────────────────────────────────────────────────────────
  // Hover/focus → feature-state
  // ──────────────────────────────────────────────────────────────────────
  const prevState = useRef({
    hoveredRiver: null as string | null,
    focusedRiver: null as string | null,
    hoveredGauge: null as string | null,
    focusedGauge: null as string | null,
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const set = (
      source: 'mo-rivers' | 'mo-gauges',
      id: string | null,
      key: 'hovered' | 'focused',
      val: boolean,
    ) => {
      if (!id) return;
      try {
        map.setFeatureState({ source, id }, { [key]: val });
      } catch {}
    };
    const p = prevState.current;
    if (p.hoveredRiver !== props.hoveredRiverId) {
      set('mo-rivers', p.hoveredRiver, 'hovered', false);
      set('mo-rivers', props.hoveredRiverId, 'hovered', true);
      p.hoveredRiver = props.hoveredRiverId;
    }
    if (p.focusedRiver !== props.focusedRiverId) {
      set('mo-rivers', p.focusedRiver, 'focused', false);
      set('mo-rivers', props.focusedRiverId, 'focused', true);
      p.focusedRiver = props.focusedRiverId;
    }
    if (p.hoveredGauge !== props.hoveredGaugeId) {
      set('mo-gauges', p.hoveredGauge, 'hovered', false);
      set('mo-gauges', props.hoveredGaugeId, 'hovered', true);
      p.hoveredGauge = props.hoveredGaugeId;
    }
    if (p.focusedGauge !== props.focusedGaugeId) {
      set('mo-gauges', p.focusedGauge, 'focused', false);
      set('mo-gauges', props.focusedGaugeId, 'focused', true);
      p.focusedGauge = props.focusedGaugeId;
    }
  }, [
    props.hoveredRiverId,
    props.focusedRiverId,
    props.hoveredGaugeId,
    props.focusedGaugeId,
    layersReady,
  ]);

  // ──────────────────────────────────────────────────────────────────────
  // Canvas particle overlay — real flow animation along river polylines
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-compute cumulative-length tables per river so we can sample at any
    // parametric t along the polyline. This lets particles travel at a
    // consistent on-screen pace independent of vertex density.
    type RiverGeom = {
      slug: string;
      coords: Array<[number, number]>;
      cumulative: number[];
      total: number;
    };
    const riverGeoms: RiverGeom[] = props.rivers.map((r) => {
      const coords = r.geometry.coordinates as Array<[number, number]>;
      const cumulative = [0];
      let total = 0;
      for (let i = 1; i < coords.length; i++) {
        const dx = coords[i][0] - coords[i - 1][0];
        const dy = coords[i][1] - coords[i - 1][1];
        total += Math.sqrt(dx * dx + dy * dy);
        cumulative.push(total);
      }
      return { slug: r.slug, coords, cumulative, total };
    });

    function sampleLonLat(g: RiverGeom, t: number): [number, number] {
      const target = t * g.total;
      // Binary search would be cleaner; linear is fine for ~40 vertices.
      let i = 1;
      while (i < g.cumulative.length && g.cumulative[i] < target) i++;
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(g.coords.length - 1, i);
      const seg = g.cumulative[i1] - g.cumulative[i0] || 1e-9;
      const f = (target - g.cumulative[i0]) / seg;
      return [
        g.coords[i0][0] + (g.coords[i1][0] - g.coords[i0][0]) * f,
        g.coords[i0][1] + (g.coords[i1][1] - g.coords[i0][1]) * f,
      ];
    }

    // Seed particles per river — count scales with percentile (more flow =
    // more particles), so high-flow rivers visually pop.
    function seedParticles() {
      const out: typeof particlesRef.current = [];
      for (const g of riverGeoms) {
        const p = props.percentileByRiver[g.slug] ?? 50;
        const verdict = props.verdictByRiver[g.slug];
        // Bony rivers go quiet, prime/pushy rivers get more particles.
        const base = p < 25 ? 2 : p < 75 ? 5 : 9;
        const n = verdict === 'hazard' ? base + 4 : base;
        for (let i = 0; i < n; i++) {
          out.push({
            riverId: g.slug,
            t: i / n + Math.random() * 0.04,
            // Speed scales mildly with percentile so high flow looks faster.
            speed: 0.018 + (p / 100) * 0.045 + Math.random() * 0.01,
            trail: [],
          });
        }
      }
      return out;
    }
    particlesRef.current = seedParticles();

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const focused = props.focusedRiverId;
      const hovered = props.hoveredRiverId;

      for (const p of particlesRef.current) {
        p.t += p.speed * dt;
        if (p.t > 1) {
          p.t -= 1;
          p.trail.length = 0;
        }
        const g = riverGeoms.find((rg) => rg.slug === p.riverId);
        if (!g) continue;

        const lonlat = sampleLonLat(g, p.t);
        const proj = map.project(lonlat as [number, number]);
        p.trail.push({ x: proj.x, y: proj.y });
        if (p.trail.length > 8) p.trail.shift();

        const river = props.rivers.find((r) => r.slug === p.riverId);
        if (!river) continue;
        const idStr = river.id;

        // Dim non-hovered/focused rivers when something is hovered/focused.
        const dim = (focused && focused !== idStr) || (hovered && hovered !== idStr && !focused);

        const baseColor = (() => {
          const verdict = props.verdictByRiver[p.riverId];
          if (verdict === 'prime') return STAGE_VERDICTS.prime.inner;
          if (verdict === 'pushy') return STAGE_VERDICTS.pushy.inner;
          if (verdict === 'hazard') return STAGE_VERDICTS.hazard.inner;
          if (verdict === 'bony') return STAGE_VERDICTS.bony.inner;
          return '#F2EAD8';
        })();

        // Trail.
        for (let i = 0; i < p.trail.length - 1; i++) {
          const a = p.trail[i];
          const b = p.trail[i + 1];
          const alpha = ((i + 1) / p.trail.length) * (dim ? 0.18 : 0.55);
          ctx.strokeStyle = baseColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.2 + (i / p.trail.length) * 1.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // Head.
        const head = p.trail[p.trail.length - 1];
        if (head) {
          ctx.globalAlpha = dim ? 0.4 : 1;
          ctx.fillStyle = '#F2EAD8';
          ctx.beginPath();
          ctx.arc(head.x, head.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    map.on('move', () => {
      // Force redraw immediately so particles track the map
      for (const p of particlesRef.current) p.trail.length = 0;
    });

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [props.rivers, props.percentileByRiver, props.verdictByRiver, props.focusedRiverId, props.hoveredRiverId]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
