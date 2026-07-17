'use client';

// src/components/map/ConditionNetworkLayer.tsx
// The statewide condition network: EVERY curated river drawn in its live
// condition color — the Observatory's statewide picture, on the interactive
// map. This is what makes the Immersive style read like Eddy instead of a
// generic satellite map, and it gives Natural/planner views the "where is
// it floatable right now" answer at a glance.
//
// Data comes from two existing CDN-cached endpoints (no new API surface):
//   /api/usgs/mo-dataset    — curated rivers with geometry + gauge thresholds
//   /api/usgs/mo-statewide  — live readings per gauge (15-min cadence, with
//                             the USGS→NWS fallback logic server-side)
// Verdicts are classified client-side with the same exported
// classifyStageFromThresholds the Observatory uses, primary gauge per river.
//
// Rendering: one geojson source with a per-feature `color` property,
// casing + data-driven line at the curated style's line anchor — beneath
// every label, and beneath the focused river / route layers (which mount
// after this one and therefore stack above it). A `excludeRiverId` prop
// keeps the page's hero river out of the network so the two never
// double-draw.

import { useEffect, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt, whenStyleReady } from './layer-anchors';
import {
  LINE_WIDTH,
  NETWORK_LINE_WIDTH,
  NETWORK_CASING_WIDTH,
  CASING_COLOR,
  HIT_WIDTH,
} from './line-style';
import type { ConditionCode } from '@shared/condition-system';
import { useConditionNetwork } from '@/hooks/useStatewideConditions';

const SOURCE_ID = 'condition-network-source';
const LINE_LAYER_ID = 'condition-network-layer';
const CASING_LAYER_ID = 'condition-network-casing-layer';
const HIGHLIGHT_LAYER_ID = 'condition-network-highlight-layer';
const HIT_LAYER_ID = 'condition-network-hit-layer';
const LABEL_LAYER_ID = 'condition-network-label-layer';

// Filter that matches no feature — the highlight layer's resting state.
const NO_MATCH: maplibregl.FilterSpecification = ['==', ['get', 'riverId'], ''];

export default function ConditionNetworkLayer({
  excludeRiverId,
  onSelectRiver,
  showLabels = true,
  visibleConditions = null,
}: {
  /** The page's hero river — rendered by ConditionRiverLayer/RouteLayer
   *  instead, so the network skips it. */
  excludeRiverId?: string;
  /** When set, each context river is clickable: clicking one activates it
   *  (the planner switches to that river). Enables a pointer cursor too. */
  onSelectRiver?: (slug: string) => void;
  /** Line-placed river name labels (toggleable from the Filters panel). */
  showLabels?: boolean;
  /** Condition codes to show, or null for all — the Filters panel's
   *  legend-chip filter ("show me only flowing rivers"). */
  visibleConditions?: ConditionCode[] | null;
}) {
  const map = useMap();
  // One condition-coded feature per curated river; classification shared
  // with the Filters panel's counts via useConditionNetwork.
  const { collection } = useConditionNetwork(excludeRiverId);
  // Bumped when a style transition finishes so the add-layers effect
  // retries (see whenStyleReady in ./layer-anchors).
  const [styleReadyTick, setStyleReadyTick] = useState(0);

  useEffect(() => {
    if (!map || !collection) return;

    // Style mid-transition (setStyle switch): retry once it settles. Never
    // gate on map.loaded() — it's false while TILES stream, and the layers
    // only need the style. (The old loaded()/once('load') gate is why
    // condition layers silently never rendered: 'load' fires once per map
    // lifetime, so data arriving during a tile stream hit a dead handler.)
    if (!map.isStyleLoaded()) {
      return whenStyleReady(map, () => setStyleReadyTick((t) => t + 1));
    }

    const hasLayer = (id: string): boolean => {
      try {
        return map.getLayer(id) !== undefined;
      } catch {
        return false;
      }
    };

    try {
      map.addSource(SOURCE_ID, { type: 'geojson', data: collection });

      addLayerAt(map, {
        id: CASING_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': CASING_COLOR, 'line-width': NETWORK_CASING_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      addLayerAt(map, {
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': NETWORK_LINE_WIDTH,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      // Hover highlight: the river under the cursor redrawn at hero width
      // in its own color, so "these lines are clickable" is discoverable.
      // Rests on a match-nothing filter; the hover handler retargets it.
      addLayerAt(map, {
        id: HIGHLIGHT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: NO_MATCH,
        paint: { 'line-color': ['get', 'color'], 'line-width': LINE_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      // Wide invisible hit target so a thin context river is easy to click.
      addLayerAt(map, {
        id: HIT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': HIT_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      // River names along the lines, so rivers are identifiable (and
      // clickable) without the dropdown. White with a dark halo reads on
      // both the light Natural style and satellite imagery.
      if (showLabels) addLayerAt(map, {
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 10, 12, 13, 14],
          'text-letter-spacing': 0.04,
          'text-max-angle': 30,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(9, 22, 28, 0.85)',
          'text-halo-width': 1.4,
          'text-halo-blur': 1,
        },
      }, ANCHORS.lines);
    } catch (err) {
      console.warn('Error adding condition network layers:', err);
    }

    return () => {
      try {
        for (const id of [LABEL_LAYER_ID, HIT_LAYER_ID, HIGHLIGHT_LAYER_ID, LINE_LAYER_ID, CASING_LAYER_ID]) {
          if (hasLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [map, collection, styleReadyTick, showLabels]);

  // Condition filter from the Filters panel's legend chips. setFilter on
  // the existing layers (cheap) rather than rebuilding the source; deps
  // include everything that re-adds layers so a rebuild gets re-filtered.
  // The highlight layer resets — it may point at a now-hidden river.
  useEffect(() => {
    if (!map) return;
    const expr = visibleConditions
      ? (['in', ['get', 'code'], ['literal', visibleConditions]] as unknown as maplibregl.FilterSpecification)
      : null;
    try {
      for (const id of [CASING_LAYER_ID, LINE_LAYER_ID, HIT_LAYER_ID, LABEL_LAYER_ID]) {
        if (map.getLayer(id)) map.setFilter(id, expr);
      }
      if (map.getLayer(HIGHLIGHT_LAYER_ID)) map.setFilter(HIGHLIGHT_LAYER_ID, NO_MATCH);
    } catch {
      // Style mid-transition; the add-layers effect re-runs this after.
    }
  }, [map, visibleConditions, collection, styleReadyTick, showLabels]);

  // Click a context river to make it the active planner river; hovering one
  // lights the whole river up via the highlight layer. Kept in its own
  // effect (keyed on the callback) so re-binding never tears down the
  // layers above.
  useEffect(() => {
    if (!map || !onSelectRiver) return;

    // The hovered feature is one segment; filtering by riverId lights every
    // segment of that river. Only touched when the hovered river changes.
    let hoveredRiverId: string | null = null;
    const setHighlight = (riverId: string | null) => {
      if (riverId === hoveredRiverId) return;
      hoveredRiverId = riverId;
      try {
        if (!map.getLayer(HIGHLIGHT_LAYER_ID)) return;
        map.setFilter(
          HIGHLIGHT_LAYER_ID,
          riverId
            ? (['==', ['get', 'riverId'], riverId] as unknown as maplibregl.FilterSpecification)
            : NO_MATCH,
        );
      } catch {
        // Style mid-transition — highlight resumes on next hover.
      }
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      const riverId = e.features?.[0]?.properties?.riverId;
      setHighlight(typeof riverId === 'string' && riverId ? riverId : null);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      setHighlight(null);
    };
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const slug = e.features?.[0]?.properties?.slug;
      if (typeof slug === 'string' && slug) onSelectRiver(slug);
    };

    map.on('mouseenter', HIT_LAYER_ID, onEnter);
    map.on('mousemove', HIT_LAYER_ID, onMove);
    map.on('mouseleave', HIT_LAYER_ID, onLeave);
    map.on('click', HIT_LAYER_ID, onClick);

    return () => {
      map.off('mouseenter', HIT_LAYER_ID, onEnter);
      map.off('mousemove', HIT_LAYER_ID, onMove);
      map.off('mouseleave', HIT_LAYER_ID, onLeave);
      map.off('click', HIT_LAYER_ID, onClick);
      setHighlight(null);
      map.getCanvas().style.cursor = '';
    };
  }, [map, onSelectRiver]);

  return null;
}
