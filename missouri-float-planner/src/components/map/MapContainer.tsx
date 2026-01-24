'use client';

// src/components/map/MapContainer.tsx
// Main map wrapper component using MapLibre GL JS
// Includes optional RainViewer weather radar overlay

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers } from 'lucide-react';

// Available map styles (all free, no API key required)
const MAP_STYLES = {
  voyager: {
    name: 'Standard',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    dark: false,
  },
  positron: {
    name: 'Light',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: false,
  },
  liberty: {
    name: 'Natural',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    dark: false,
  },
  bright: {
    name: 'Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
    dark: false,
  },
  satellite: {
    name: 'Satellite',
    url: '', // Custom style object used instead
    dark: true,
  },
  dark: {
    name: 'Dark',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    dark: true,
  },
} as const;

// Custom satellite style using ESRI World Imagery (free, no API key)
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '&copy; Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

type MapStyleKey = keyof typeof MAP_STYLES;

interface MapContainerProps {
  initialBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  children?: React.ReactNode;
  showWeatherOverlay?: boolean;
  onWeatherToggle?: (enabled: boolean) => void;
  showLegend?: boolean;
}

// RainViewer API types
interface RainViewerResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: Array<{ time: number; path: string }>;
    nowcast: Array<{ time: number; path: string }>;
  };
}

export default function MapContainer({
  initialBounds,
  children,
  showWeatherOverlay = false,
  onWeatherToggle,
  showLegend = false,
}: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [weatherEnabled, setWeatherEnabled] = useState(showWeatherOverlay);
  const [radarTimestamp, setRadarTimestamp] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('liberty');
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const radarSourceId = 'rainviewer-radar';
  const radarLayerId = 'rainviewer-radar-layer';

  // Load saved style preference - one-time migration to 'liberty' (Natural) as default
  useEffect(() => {
    const migrated = localStorage.getItem('mapStyleMigrated');
    const saved = localStorage.getItem('mapStyle') as MapStyleKey | null;

    // One-time migration: reset to 'liberty' if not already migrated
    if (!migrated) {
      localStorage.setItem('mapStyleMigrated', '1');
      localStorage.setItem('mapStyle', 'liberty');
      setMapStyle('liberty');
    } else if (saved && MAP_STYLES[saved]) {
      setMapStyle(saved);
    }
  }, []);

  // Change map style
  const changeMapStyle = useCallback((styleKey: MapStyleKey) => {
    if (!map.current) return;

    setMapStyle(styleKey);
    localStorage.setItem('mapStyle', styleKey);
    setShowStylePicker(false);

    // Use custom style object for satellite, URL for others
    const style = styleKey === 'satellite' ? SATELLITE_STYLE : MAP_STYLES[styleKey].url;
    map.current.setStyle(style);

    // Re-apply background color after style loads (only for dark styles)
    map.current.once('style.load', () => {
      if (MAP_STYLES[styleKey].dark) {
        try {
          map.current?.setPaintProperty('background', 'background-color', '#0f132f');
        } catch {
          // Background layer might not exist
        }
      }
      // Re-trigger radar layer if enabled
      if (weatherEnabled && radarTimestamp) {
        updateRadarLayer();
      }
    });
  }, [weatherEnabled, radarTimestamp]);

  // Fetch latest radar timestamp from RainViewer API
  const fetchRadarTimestamp = useCallback(async () => {
    try {
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data: RainViewerResponse = await response.json();
      
      // Get the most recent radar frame
      const latestRadar = data.radar.past[data.radar.past.length - 1];
      if (latestRadar) {
        setRadarTimestamp(latestRadar.path);
      }
    } catch (error) {
      console.warn('Failed to fetch RainViewer data:', error);
    }
  }, []);

  // Add or remove radar layer
  const updateRadarLayer = useCallback(() => {
    if (!map.current || !mapLoaded) return;

    const hasSource = map.current.getSource(radarSourceId) !== undefined;
    const hasLayer = map.current.getLayer(radarLayerId) !== undefined;

    if (weatherEnabled && radarTimestamp) {
      // RainViewer tile URL format
      const tileUrl = `https://tilecache.rainviewer.com${radarTimestamp}/256/{z}/{x}/{y}/2/1_1.png`;

      if (hasSource) {
        // Update existing source
        try {
          (map.current.getSource(radarSourceId) as maplibregl.RasterTileSource).setTiles([tileUrl]);
        } catch {
          // If update fails, remove and re-add
          if (hasLayer) map.current.removeLayer(radarLayerId);
          map.current.removeSource(radarSourceId);
        }
      }

      if (!hasSource) {
        // Add new source
        map.current.addSource(radarSourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution: '<a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
        });
      }

      if (!hasLayer) {
        // Add layer below river layers (find first line layer)
        const layers = map.current.getStyle().layers;
        let beforeLayerId: string | undefined;
        for (const layer of layers || []) {
          if (layer.type === 'line') {
            beforeLayerId = layer.id;
            break;
          }
        }

        map.current.addLayer(
          {
            id: radarLayerId,
            type: 'raster',
            source: radarSourceId,
            paint: {
              'raster-opacity': 0.6,
            },
          },
          beforeLayerId
        );
      }
    } else {
      // Remove radar layer if disabled
      if (hasLayer) {
        map.current.removeLayer(radarLayerId);
      }
      if (hasSource) {
        map.current.removeSource(radarSourceId);
      }
    }
  }, [weatherEnabled, radarTimestamp, mapLoaded]);

  // Toggle weather overlay
  const toggleWeather = useCallback(() => {
    const newValue = !weatherEnabled;
    setWeatherEnabled(newValue);
    onWeatherToggle?.(newValue);
  }, [weatherEnabled, onWeatherToggle]);

  // Fetch radar data when weather is enabled
  useEffect(() => {
    if (weatherEnabled) {
      fetchRadarTimestamp();
      // Refresh every 5 minutes
      const interval = setInterval(fetchRadarTimestamp, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [weatherEnabled, fetchRadarTimestamp]);

  // Update radar layer when state changes
  useEffect(() => {
    updateRadarLayer();
  }, [updateRadarLayer]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Get saved style or use liberty (Natural) as default
    const savedStyle = localStorage.getItem('mapStyle') as MapStyleKey | null;
    const initialStyle = savedStyle && MAP_STYLES[savedStyle] ? savedStyle : 'liberty';
    // Use custom style object for satellite, URL for others
    const mapStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
      (initialStyle === 'satellite' ? SATELLITE_STYLE : MAP_STYLES[initialStyle].url);

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyleUrl,
      center: initialBounds
        ? [
            (initialBounds[0] + initialBounds[2]) / 2,
            (initialBounds[1] + initialBounds[3]) / 2,
          ]
        : [-91.5, 37.8], // Center of Missouri
      zoom: initialBounds ? 8 : 7,
      bounds: initialBounds
        ? new maplibregl.LngLatBounds(
            [initialBounds[0], initialBounds[1]],
            [initialBounds[2], initialBounds[3]]
          )
        : undefined,
      fitBoundsOptions: {
        padding: 50,
      },
    });
    
    // Set map background to river-night only for dark styles
    map.current.on('style.load', () => {
      if (map.current && MAP_STYLES[initialStyle].dark) {
        try {
          map.current.setPaintProperty('background', 'background-color', '#0f132f');
        } catch (error) {
          // Background layer might not exist in all styles
          console.warn('Could not set background color:', error);
        }
      }
    });

    // Handle missing images (suppress warnings for style images)
    map.current.on('styleimagemissing', (e: maplibregl.MapStyleImageMissingEvent) => {
      // Suppress warnings for missing style images (like us-interstate_6)
      // These are typically from the map style and don't affect functionality
      console.debug('Map style image missing:', e.id);
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialBounds]);

  useEffect(() => {
    if (!map.current || !initialBounds) return;

    const bounds = new maplibregl.LngLatBounds(
      [initialBounds[0], initialBounds[1]],
      [initialBounds[2], initialBounds[3]]
    );

    if (!map.current.loaded()) {
      const handleLoad = () => {
        map.current?.fitBounds(bounds, { padding: 50, duration: 800 });
      };
      map.current.once('load', handleLoad);
      return () => {
        map.current?.off('load', handleLoad);
      };
    }

    map.current.fitBounds(bounds, { padding: 50, duration: 800 });
  }, [initialBounds]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div 
        ref={mapContainer} 
        className="w-full h-full"
        style={{ pointerEvents: 'auto', minHeight: '400px' }}
      />
      {mapLoaded && map.current && (
        <MapProvider map={map.current}>{children}</MapProvider>
      )}
      
      {/* Map Style Picker - positioned below MapLibre navigation controls */}
      <div className="absolute top-[120px] right-2.5 z-10">
        <button
          onClick={() => setShowStylePicker(!showStylePicker)}
          className={`p-2 rounded-lg shadow-lg transition-all ${
            showStylePicker
              ? 'bg-river-water text-white'
              : 'bg-white/90 text-gray-700 hover:bg-white'
          }`}
          title="Change map style"
          aria-label="Change map style"
        >
          <Layers className="w-5 h-5" />
        </button>

        {showStylePicker && (
          <div className="absolute top-full right-0 mt-2 bg-white/95 backdrop-blur-md rounded-lg shadow-lg border border-gray-200 overflow-hidden min-w-[120px]">
            {(Object.keys(MAP_STYLES) as MapStyleKey[]).map((key) => (
              <button
                key={key}
                onClick={() => changeMapStyle(key)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors ${
                  mapStyle === key ? 'bg-river-50 text-river-600 font-medium' : 'text-gray-700'
                }`}
              >
                {MAP_STYLES[key].name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weather Overlay Toggle Button - moved left on desktop to avoid zoom controls */}
      <button
        onClick={toggleWeather}
        className={`absolute top-[168px] right-2.5 md:right-12 z-10 p-2 rounded-lg shadow-lg transition-all ${
          weatherEnabled
            ? 'bg-river-water text-white'
            : 'bg-white/90 text-gray-700 hover:bg-white'
        }`}
        title={weatherEnabled ? 'Hide weather radar' : 'Show weather radar'}
        aria-label={weatherEnabled ? 'Hide weather radar' : 'Show weather radar'}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
          />
        </svg>
      </button>
      
      {/* Weather Attribution */}
      {weatherEnabled && (
        <div className="absolute bottom-1 left-1 z-10 text-xs text-white/60 bg-black/30 px-1 rounded">
          Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer" className="underline">RainViewer</a>
        </div>
      )}

      {/* Collapsible Map Legend - default minimized */}
      {showLegend && (
        <div className="absolute bottom-2 right-2 z-10 rounded-xl border border-white/10 bg-river-night/80 text-xs text-white shadow-lg backdrop-blur">
          <button
            onClick={() => setLegendExpanded(!legendExpanded)}
            className="flex items-center gap-2 px-3 py-2 w-full hover:bg-white/5 transition-colors rounded-xl"
          >
            <svg
              className={`w-3 h-3 transition-transform ${legendExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-[11px] font-semibold text-river-gravel">Legend</span>
          </button>
          {legendExpanded && (
            <div className="flex flex-col gap-1 px-3 pb-2">
              <LegendItem color="#478559" label="Put-in" />
              <LegendItem color="#f95d9b" label="Take-out" />
              <LegendItem color="#c7b8a6" label="Access point" />
              <LegendItem color="#22c55e" label="Route (downstream)" />
              <LegendItem color="#ef4444" label="Route (upstream)" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-[11px] text-white/80">{label}</span>
    </div>
  );
}

// Context to share map instance with child components
import { createContext, useContext } from 'react';

const MapContext = createContext<maplibregl.Map | null>(null);

export function useMap() {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error('useMap must be used within MapContainer');
  }
  return map;
}

// Wrapper component that provides map context
export function MapProvider({
  map,
  children,
}: {
  map: maplibregl.Map | null;
  children: React.ReactNode;
}) {
  return (
    <MapContext.Provider value={map}>{children}</MapContext.Provider>
  );
}
