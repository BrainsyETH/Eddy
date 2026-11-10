'use client';

// The river page's map, reused inside a guide with the featured floats
// pre-drawn. It mounts only when the reader scrolls near it (the engine is
// ~250 KB gz), and any failure leaves the static drawing underneath showing.

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import type { GuideRouteLine } from '@/components/map/GuideRoutesLayer';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), { ssr: false });
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });
const GuideRoutesLayer = dynamic(() => import('@/components/map/GuideRoutesLayer'), { ssr: false });

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function GuideRouteMap({ riverSlug, routes, bounds, selectedId, onSelect }: {
  riverSlug: string;
  routes: GuideRouteLine[];
  bounds: [number, number, number, number];
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const { data: accessPoints = [] } = useAccessPoints(riverSlug);
  return (
    <MapBoundary>
      <MapContainer initialBounds={bounds} showLegend={false} legendRoute={false} cooperativeGestures={true}>
        <GuideRoutesLayer routes={routes} selectedId={selectedId} onSelect={onSelect} />
        <AccessPointMarkers accessPoints={accessPoints} />
      </MapContainer>
    </MapBoundary>
  );
}
