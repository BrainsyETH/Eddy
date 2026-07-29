'use client';

// src/components/map/PublicLandsLayer.tsx
// Public land boundaries from USGS PAD-US, drawn under everything else.
//
// ── What this layer does NOT say ───────────────────────────────────────────
// OWNERSHIP, NOT PERMISSION. A polygon here means a public agency owns the
// ground. It does not mean a paddler may camp on it, portage across it, tie up
// to it, or step out of the boat onto it — and the boundary itself is the
// agency's, at the agency's precision, never a survey. The caveat is rendered
// in the layer panel while the layer is on, and again in every popup, because
// the failure mode of getting this wrong is somebody planning a night on ground
// they will be moved off.
//
// ── The encoding ───────────────────────────────────────────────────────────
// One earth-tone family for "this is public ground", with WEIGHT carrying how
// much the agency will commit to: open is solid and most present, unknown is
// faint and dotted. The classification itself is in the popup in words, because
// "restricted" covers permit-only, daylight-only, seasonal and hunting-only, and
// no amount of line styling distinguishes those. See ../../lib/map/public-land-style.ts
// for why none of these colours may come from the condition ramp.
//
// ── Why the dash needs three layers ────────────────────────────────────────
// `line-dasharray` is one of the few paint properties MapLibre will NOT accept a
// data-driven expression for. Colour and width are data-driven on one layer;
// the solid/dashed split has to be two filtered layers. That is the whole reason
// there are three layers here rather than two.
//
// ── Viewport-driven, like the national gauge tier ──────────────────────────
// Boundaries are big and there is no point holding Missouri's in memory to draw
// eight miles of river. Same discipline as eddy-ios/src/hooks/useViewportGauges:
// zoom floor, debounce, containment check, quantized bbox, and a failure that
// keeps whatever is already drawn rather than blanking it.

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt, whenStyleReady } from './layer-anchors';
import { presentPopup } from './popup-manager';
import {
  bboxContains,
  padBbox,
  quantizeBbox,
  type Bounds,
} from '@/lib/map/viewport';
import {
  PUBLIC_LAND_ACCESS_ORDER,
  PUBLIC_LAND_ACCESS_STYLE,
  PUBLIC_LAND_OWNERSHIP_NOTE,
  publicLandAccessLabel,
} from '@/lib/map/public-land-style';

const SOURCE_ID = 'public-lands-source';
const FILL_LAYER_ID = 'public-lands-fill';
const LINE_SOLID_LAYER_ID = 'public-lands-line-open';
const LINE_DASHED_LAYER_ID = 'public-lands-line-restricted';

/**
 * Below this the layer draws nothing and asks for nothing.
 *
 * A parcel boundary is a line you read against a river, and at a statewide zoom
 * there is no river to read it against — only a wash of fill over four states.
 * Matches MIN_ZOOM in /api/public-lands, which returns an empty collection below
 * it regardless.
 */
const MIN_ZOOM = 7;

/** A pan emits several moveend events; only the last should cost a request. */
const DEBOUNCE_MS = 400;

/** Panning back through a few screens should never re-fetch. */
const CACHE_SIZE = 8;

interface LandProperties {
  id: string;
  name: string;
  manager: string | null;
  managerType: string | null;
  designation: string | null;
  /** Normalised by the API: upper-case, never null, 'UK' when unclassified. */
  access: string;
  acres: number | null;
}

interface LandsPayload {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; properties: LandProperties; geometry: unknown }>;
  capped: boolean;
  total: number;
}

const EMPTY: LandsPayload = { type: 'FeatureCollection', features: [], capped: false, total: 0 };

/**
 * `match` on the access code, defaulting to UK.
 *
 * Built from the same table both apps mirror rather than written out, so adding
 * a class is one edit. The default arm is not a nicety: PAD-US gains codes
 * without asking us, and an unrecognised one has to render as "unknown" — never
 * as open, and never as invisible.
 *
 * Reads `access` bare because the API normalises it — upper-case, never null.
 * The alternative was an upcase/coalesce wrapper here AND its equivalent in
 * Mapbox's native expression dialect on the phone, which is two chances to be
 * subtly different about which parcels count as open.
 */
function accessMatch(pick: (code: keyof typeof PUBLIC_LAND_ACCESS_STYLE) => string | number) {
  const arms: (string | number)[] = [];
  for (const code of PUBLIC_LAND_ACCESS_ORDER) {
    arms.push(code, pick(code));
  }
  return ['match', ['get', 'access'], ...arms, pick('UK')] as unknown as maplibregl.ExpressionSpecification;
}

/** Only OA is drawn solid; the dashed layer takes everything else. */
const OPEN_FILTER = ['==', ['get', 'access'], 'OA'] as unknown as maplibregl.FilterSpecification;
const NOT_OPEN_FILTER = ['!=', ['get', 'access'], 'OA'] as unknown as maplibregl.FilterSpecification;

function popupHtml(props: LandProperties): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const manager = props.manager && props.manager !== 'UNK' ? props.manager : null;
  const detail = [props.designation, manager].filter(Boolean).join(' · ');
  const acres =
    typeof props.acres === 'number' && Number.isFinite(props.acres) && props.acres > 0
      ? `${Math.round(props.acres).toLocaleString()} acres`
      : null;

  return `
    <div class="min-w-[200px] max-w-[260px]">
      <div class="font-semibold text-sm text-neutral-900">${esc(props.name)}</div>
      ${detail ? `<div class="text-xs text-neutral-600 mt-0.5">${esc(detail)}</div>` : ''}
      <div class="text-xs text-neutral-800 mt-1.5 font-medium">${esc(publicLandAccessLabel(props.access))}</div>
      ${acres ? `<div class="text-[11px] text-neutral-500 mt-0.5">${esc(acres)}</div>` : ''}
      <div class="text-[11px] text-neutral-500 mt-2 pt-2 border-t border-neutral-200">${esc(PUBLIC_LAND_OWNERSHIP_NOTE)}</div>
    </div>
  `;
}

export default function PublicLandsLayer() {
  const map = useMap();
  const [payload, setPayload] = useState<LandsPayload>(EMPTY);
  // Bumped when a style transition finishes so the add-layers effect retries.
  const [styleReadyTick, setStyleReadyTick] = useState(0);

  const cache = useRef(new Map<string, LandsPayload>());
  // Bbox AND zoom. The server simplifies to the requested zoom, so holding a box
  // is only holding an answer at the detail it was asked for — zooming in inside
  // coverage still has to refetch or the boundary visibly cuts corners.
  const lastRequested = useRef<{ bbox: Bounds; zoom: number } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (bbox: Bounds, zoom: number) => {
    const key = `${bbox.join(',')}@${zoom}`;
    const hit = cache.current.get(key);
    if (hit) {
      lastRequested.current = { bbox, zoom };
      setPayload(hit);
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const params = new URLSearchParams({ bbox: bbox.join(','), zoom: String(zoom) });
      const res = await fetch(`/api/public-lands?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) return;
      const data = (await res.json()) as LandsPayload;
      if (controller.signal.aborted) return;

      const next: LandsPayload = {
        type: 'FeatureCollection',
        features: data.features ?? [],
        capped: data.capped ?? false,
        total: data.total ?? 0,
      };
      cache.current.set(key, next);
      if (cache.current.size > CACHE_SIZE) {
        const oldest = cache.current.keys().next().value;
        if (oldest !== undefined) cache.current.delete(oldest);
      }
      lastRequested.current = { bbox, zoom };
      setPayload(next);
    } catch {
      // Keep whatever is drawn. This layer is additive context; losing it
      // quietly beats blanking it and announcing a failure for something the
      // reader did not ask to happen.
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  // Fetch on mount and after every camera move that leaves what we hold.
  useEffect(() => {
    if (!map) return;

    const request = () => {
      if (timer.current) clearTimeout(timer.current);
      const zoom = map.getZoom();
      if (zoom < MIN_ZOOM) {
        inFlight.current?.abort();
        inFlight.current = null;
        // Drop the polygons as well as the request: a continental view washed
        // with whatever was in the last valley is worse than an empty one.
        lastRequested.current = null;
        setPayload(EMPTY);
        return;
      }

      const b = map.getBounds();
      const bounds: Bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const rounded = Math.round(zoom);
      if (
        lastRequested.current &&
        lastRequested.current.zoom === rounded &&
        bboxContains(lastRequested.current.bbox, bounds)
      ) {
        return;
      }

      const target = quantizeBbox(padBbox(bounds, 0.2), zoom);
      timer.current = setTimeout(() => void load(target, rounded), DEBOUNCE_MS);
    };

    request();
    map.on('moveend', request);
    return () => {
      map.off('moveend', request);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [map, load]);

  // Abort on unmount so a hidden map is not still fetching.
  useEffect(() => () => inFlight.current?.abort(), []);

  // Add the source and the three layers. Re-runs on styleReadyTick because
  // setStyle() wipes every custom source — the component is also remounted by
  // MapContainer's styleEpoch key, which covers the common case; this covers a
  // mount that lands mid-transition.
  useEffect(() => {
    if (!map) return;
    if (!map.isStyleLoaded()) {
      return whenStyleReady(map, () => setStyleReadyTick((t) => t + 1));
    }

    try {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: 'geojson', data: payload as GeoJSON.FeatureCollection });
      }

      // BELOW the line anchor, not the overlay anchor the radar uses. Public
      // land is the ground a river runs through: it belongs under the water,
      // under the route and under every pin. Added at the `overlays` slot so it
      // sits above the basemap's land fills and hillshade but beneath all of
      // Eddy's own data — and first, so anything added at the same anchor later
      // stacks on top of it.
      if (!map.getLayer(FILL_LAYER_ID)) {
        addLayerAt(
          map,
          {
            id: FILL_LAYER_ID,
            type: 'fill',
            source: SOURCE_ID,
            // Alpha is baked into the colour rather than set as fill-opacity:
            // one data-driven property instead of two that have to agree.
            paint: { 'fill-color': accessMatch((c) => PUBLIC_LAND_ACCESS_STYLE[c].fill) },
          },
          ANCHORS.overlays,
        );
      }

      if (!map.getLayer(LINE_SOLID_LAYER_ID)) {
        addLayerAt(
          map,
          {
            id: LINE_SOLID_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: OPEN_FILTER,
            paint: {
              'line-color': PUBLIC_LAND_ACCESS_STYLE.OA.line,
              'line-width': 1.4,
              'line-opacity': 0.9,
            },
          },
          ANCHORS.overlays,
        );
      }

      if (!map.getLayer(LINE_DASHED_LAYER_ID)) {
        addLayerAt(
          map,
          {
            id: LINE_DASHED_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: NOT_OPEN_FILTER,
            paint: {
              'line-color': accessMatch((c) => PUBLIC_LAND_ACCESS_STYLE[c].line),
              'line-width': 1.1,
              'line-opacity': 0.85,
              // Short dashes read as "provisional" at every zoom this layer
              // draws at; longer ones start to look like a solid line when the
              // parcel is small.
              'line-dasharray': [2, 1.5],
            },
          },
          ANCHORS.overlays,
        );
      }
    } catch (err) {
      console.warn('Error adding public land layers:', err);
    }

    return () => {
      try {
        for (const id of [LINE_DASHED_LAYER_ID, LINE_SOLID_LAYER_ID, FILL_LAYER_ID]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // A map torn down before this ran throws harmlessly.
      }
    };
  }, [map, styleReadyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // New data goes through setData rather than rebuilding the source, so panning
  // never removes and re-adds three layers (which flickers, and reorders them
  // above anything inserted at the same anchor since).
  useEffect(() => {
    if (!map) return;
    try {
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      source?.setData(payload as GeoJSON.FeatureCollection);
    } catch {
      // Style mid-transition; the add-layers effect seeds the data on retry.
    }
  }, [map, payload, styleReadyTick]);

  // Click a parcel to find out what it is — and, more to the point, to be told
  // in words what the fill does not say.
  useEffect(() => {
    if (!map) return;

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px' });

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties as unknown as LandProperties | undefined;
      if (!props) return;
      popup.setHTML(popupHtml(props));
      presentPopup(map, popup, e.lngLat);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', FILL_LAYER_ID, onClick);
    map.on('mouseenter', FILL_LAYER_ID, onEnter);
    map.on('mouseleave', FILL_LAYER_ID, onLeave);

    return () => {
      map.off('click', FILL_LAYER_ID, onClick);
      map.off('mouseenter', FILL_LAYER_ID, onEnter);
      map.off('mouseleave', FILL_LAYER_ID, onLeave);
      try {
        popup.remove();
      } catch {
        // Already gone.
      }
      map.getCanvas().style.cursor = '';
    };
  }, [map, styleReadyTick]);

  return null;
}
