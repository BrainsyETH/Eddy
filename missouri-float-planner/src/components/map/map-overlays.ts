// Declarative catalog for optional map information.
//
// Basemaps answer "what should the map look like?"; these answer "what extra
// information should it show?" Keeping the labels, attribution and caveats in
// one catalog prevents the layers menu and the on-map credits from drifting as
// overlays are added. Rendering/fetch behavior remains in MapContainer and the
// individual layer components.

import { PUBLIC_LAND_OWNERSHIP_NOTE } from '@/lib/map/public-land-style';

export type MapOverlayKey = 'weather' | 'publicLands';

export interface MapOverlayDef {
  id: MapOverlayKey;
  label: string;
  caveat?: string;
  attribution: {
    label: string;
    source: string;
    url: string;
  };
}

export const MAP_OVERLAYS: readonly MapOverlayDef[] = [
  {
    id: 'weather',
    label: 'Weather radar',
    attribution: {
      label: 'Radar',
      source: 'RainViewer',
      url: 'https://www.rainviewer.com/',
    },
  },
  {
    id: 'publicLands',
    label: 'Public land',
    caveat: PUBLIC_LAND_OWNERSHIP_NOTE,
    attribution: {
      label: 'Boundaries',
      source: 'USGS PAD-US',
      url: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview',
    },
  },
];
