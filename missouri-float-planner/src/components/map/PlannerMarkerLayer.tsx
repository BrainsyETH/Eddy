'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Marker, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { useMap } from './map-context';
import { enableMarkerKeyboard } from './marker-keyboard';
import { eddyIconUrl } from '@/components/ui/EddyIcon';
import { referenceColor } from '@/lib/gauges/map-index';
import type { PlannerMarker } from '@/lib/planner-markers';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS, getEddyImageForCondition } from '@/constants';

export const REFERENCE_GAUGE_SOURCE = 'planner-reference-gauges';
export const REFERENCE_GAUGE_HITS = 'planner-reference-gauge-hits';
export const PLANNER_PLACE_HITS = 'planner-place-hits';

interface Props {
  layer?: 'places' | 'reference';
  places: PlannerMarker[];
  selectedKey: string | null;
  onSelect: (place: PlannerMarker) => void;
  onGroup: (places: PlannerMarker[], coordinates: { lng: number; lat: number }) => void;
  onDismiss: () => void;
}

function features(places: PlannerMarker[], selectedKey: string | null): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: places.map(place => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [place.coordinates.lng, place.coordinates.lat] },
    properties: { key: place.key, inspected: Number(place.key === selectedKey),
      putIn: Number(place.role === 'put-in'), takeOut: Number(place.role === 'take-out') },
  })) };
}

/** Independent instances own independent cluster trees; reference gauges never absorb places. */
export default function PlannerMarkerLayer(props: Props) {
  const map = useMap();
  const referenceLayer = props.layer === 'reference';
  const SOURCE = referenceLayer ? REFERENCE_GAUGE_SOURCE : 'planner-places';
  const hitLayer = referenceLayer ? REFERENCE_GAUGE_HITS : PLANNER_PLACE_HITS;
  const byKey = useMemo(() => new Map(props.places.map(place => [place.key, place])), [props.places]);
  const byKeyRef = useRef(byKey);
  useLayoutEffect(() => { byKeyRef.current = byKey; }, [byKey]);
  const latest = useRef(props);
  const renderedRef = useRef(new Map<string, { marker: Marker; signature: string; itemKey?: string; cluster: boolean }>());
  useLayoutEffect(() => {
    const keys = new Set(props.places.map(place => place.key));
    const membershipChanged = latest.current.places.length !== props.places.length
      || latest.current.places.some(place => !keys.has(place.key));
    latest.current = props;
    // Source updates run in a worker. Retire removed controls immediately so
    // an old river/filter cannot remain clickable while the new tiles load.
    for (const [key, entry] of renderedRef.current) {
      if ((entry.itemKey && !keys.has(entry.itemKey)) || (entry.cluster && membershipChanged)) {
        entry.marker.remove(); renderedRef.current.delete(key);
      }
    }
  });
  useLayoutEffect(() => {
    let disposed = false;
    let frame = 0;
    const rendered = renderedRef.current;
    map.addSource(SOURCE, { type: 'geojson', data: features(latest.current.places, latest.current.selectedKey),
      cluster: true, clusterRadius: 56, maxzoom: 24, clusterMaxZoom: 22,
      clusterProperties: { inspected: ['+', ['get', 'inspected']], putIn: ['+', ['get', 'putIn']], takeOut: ['+', ['get', 'takeOut']] },
    });
    // Load source tiles and give river hit testing a place-priority layer.
    // The accessible HTML pins below own the actual appearance and actions.
    map.addLayer({ id: hitLayer, type: 'circle', source: SOURCE,
      paint: { 'circle-radius': 22, 'circle-opacity': 0 } });

    const update = () => {
      if (disposed || !map.isSourceLoaded(SOURCE)) return;
      const { places, selectedKey } = latest.current;
      const byKey = byKeyRef.current;
      const selected = selectedKey ? byKey.get(selectedKey) : undefined;
      const putIn = places.find(place => place.role === 'put-in');
      const takeOut = places.find(place => place.role === 'take-out');
      const source = map.getSource(SOURCE) as GeoJSONSource;
      const visible = new Set<string>();
      const canvas = map.getCanvas();
      for (const feature of map.querySourceFeatures(SOURCE)) {
        if (feature.geometry.type !== 'Point') continue;
        const properties = feature.properties;
        const cluster = properties.cluster === true;
        const key = cluster ? `${referenceLayer ? 'reference-cluster' : 'cluster'}:${properties.cluster_id}` : String(properties.key);
        if (visible.has(key)) continue;
        const item = cluster ? properties.inspected && selected ? selected
          : properties.putIn && putIn ? putIn : properties.takeOut && takeOut ? takeOut : undefined
          : byKey.get(key);
        if (!cluster && !item) continue;
        const coordinates = item?.coordinates ?? { lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };
        const screen = map.project([coordinates.lng, coordinates.lat]);
        if (screen.x < -30 || screen.y < -30 || screen.x > canvas.clientWidth + 30 || screen.y > canvas.clientHeight + 30) continue;
        visible.add(key);
        const inspected = !!item && item.key === selectedKey;
        const count = cluster ? Number(properties.point_count) : 1;
        const condition = item?.kind === 'gauge' ? item.condition : null;
        const reference = item?.kind === 'referenceGauge' ? referenceColor(item.gauge) : null;
        const signature = `${referenceLayer && map.getZoom() >= 10.5}::${reference}:${item?.key}:${item?.name}:${item?.symbol}:${item?.role}:${condition}:${inspected}:${count}`;
        const existing = rendered.get(key);
        if (existing?.signature === signature) {
          existing.marker.setLngLat([coordinates.lng, coordinates.lat]);
          existing.marker.getElement().tabIndex = screen.x >= 0 && screen.y >= 0 && screen.x <= canvas.clientWidth && screen.y <= canvas.clientHeight ? 0 : -1;
          continue;
        }
        const restoreFocus = existing?.marker.getElement() === document.activeElement;
        existing?.marker.remove();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `planner-map-marker ${item?.kind === 'access' ? 'access-point-marker' : item?.kind === 'gauge' || item?.kind === 'referenceGauge' ? 'gauge-station-marker' : item?.kind === 'poi' ? 'poi-marker' : 'planner-cluster-marker'}`;
        button.dataset.plannerMarker = key;
        if (referenceLayer) {
          button.dataset.referenceGauge = 'true';
          // Access points/POIs stay on top, even when a reference is selected.
          button.style.zIndex = '1';
          if (cluster) button.dataset.referenceClusterCount = String(count);
        }
        if (item?.kind === 'access') button.dataset.accessPointId = item.id;
        if (item?.kind === 'poi') button.dataset.poiId = item.id;
        if (item?.kind === 'gauge' || item?.kind === 'referenceGauge') button.dataset.gaugeId = item.id;
        if (item?.kind === 'referenceGauge') button.dataset.usgsSiteId = item.gauge.siteId;
        if (item?.role) button.dataset.endpointRole = item.role;
        if (inspected) button.dataset.selectedPlaceId = item!.id;
        if (cluster) button.dataset.clusterCount = String(count);
        button.setAttribute('aria-pressed', String(inspected));
        const face = document.createElement('span');
        face.className = 'planner-marker-face';
        if (item) {
          const art = document.createElement('img');
          art.src = condition ? getEddyImageForCondition(condition) : eddyIconUrl(item.symbol);
          art.alt = ''; art.width = 28; art.height = 28;
          art.draggable = false; face.appendChild(art);
          if (condition) face.style.borderColor = CONDITION_COLORS[condition];
          if (reference) { face.style.borderColor = reference; face.style.backgroundColor = reference; }
        } else face.textContent = String(count);
        button.appendChild(face);
        if (item && cluster) {
          const badge = document.createElement('span');
          badge.className = 'planner-marker-count'; badge.textContent = String(count); button.appendChild(badge);
        }
        if (item && (inspected || item.role || (referenceLayer && map.getZoom() >= 10.5))) {
          const label = document.createElement('span');
          label.className = 'planner-marker-label';
          const role = item.role === 'put-in' ? 'Put-in' : item.role === 'take-out' ? 'Take-out' : '';
          label.textContent = inspected || referenceLayer ? [role, item.name].filter(Boolean).join(' · ') : role;
          button.appendChild(label);
        }
        const label = cluster ? `${count} ${referenceLayer ? 'USGS gauges' : 'places'} here${item ? `, ${item.name}` : ''}. Choose ${referenceLayer ? 'a gauge' : 'a place'}`
          : `${item!.name}${item!.role ? `, ${item!.role}` : ''}${condition ? `, ${CONDITION_SHORT_LABELS[condition]}` : ''}. Open ${item!.kind === 'gauge' || item!.kind === 'referenceGauge' ? 'gauge' : 'place'} details`;
        enableMarkerKeyboard(button, label, () => latest.current.onDismiss());
        button.tabIndex = screen.x >= 0 && screen.y >= 0 && screen.x <= canvas.clientWidth && screen.y <= canvas.clientHeight ? 0 : -1;
        // A pin is a control, not a map gesture surface. In particular, two
        // quick touch selections must not also trigger MapLibre double-tap zoom.
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
          button.addEventListener(type, event => event.stopPropagation(), { passive: true });
        }
        button.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); });
        button.addEventListener('click', async event => {
          event.preventDefault(); event.stopPropagation();
          if (!cluster) {
            const current = latest.current.places.find(place => place.key === item!.key);
            if (current) latest.current.onSelect(current);
            return;
          }
          try {
            const expansion = await source.getClusterExpansionZoom(properties.cluster_id);
            if (disposed) return;
            if (!item && map.getZoom() < 13 && expansion > map.getZoom() + 0.5) {
              map.easeTo({ center: [coordinates.lng, coordinates.lat], zoom: Math.min(15, expansion),
                duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 });
              return;
            }
            const leaves = await source.getClusterLeaves(properties.cluster_id, count, 0);
            if (disposed) return;
            const current = byKeyRef.current;
            const members = leaves.flatMap(leaf => { const place = current.get(String(leaf.properties?.key)); return place ? [place] : []; });
            latest.current.onGroup(members, coordinates);
          } catch {
            // A basemap or filter change can invalidate a cluster request.
          }
        });
        const marker = new Marker({ element: button, anchor: 'center' }).setLngLat([coordinates.lng, coordinates.lat]).addTo(map);
        rendered.set(key, { marker, signature, itemKey: item?.key, cluster });
        if (restoreFocus) button.focus({ preventScroll: true });
      }
      for (const [key, entry] of rendered) if (!visible.has(key)) { entry.marker.remove(); rendered.delete(key); }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    map.on('sourcedata', schedule); map.on('moveend', schedule); map.on('resize', schedule);
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      map.off('sourcedata', schedule); map.off('moveend', schedule); map.off('resize', schedule);
      for (const entry of rendered.values()) entry.marker.remove();
      rendered.clear();
      if (map.getLayer(hitLayer)) map.removeLayer(hitLayer);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, SOURCE, hitLayer, referenceLayer]);
  useLayoutEffect(() => {
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(features(props.places, props.selectedKey));
  }, [map, SOURCE, props.places, props.selectedKey]);
  return null;
}
