// src/types/geo.ts
// GeoJSON and geographic types for Eddy

import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';

// Re-export common GeoJSON types for convenience
export type { Feature, FeatureCollection, LineString, Point, Position };

// Custom geographic types
export interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface Coordinates {
  lng: number;
  lat: number;
}

// River geometry feature
export interface RiverFeature extends Feature<LineString> {
  properties: {
    id: string;
    name: string;
    slug: string;
    lengthMiles: number;
  };
}

// Access point feature
export interface AccessPointFeature extends Feature<Point> {
  properties: {
    id: string;
    name: string;
    type: string;
    riverMile: number;
    isPublic: boolean;
  };
}

// Hazard feature
export interface HazardFeature extends Feature<Point> {
  properties: {
    id: string;
    name: string;
    type: string;
    severity: string;
    riverMile: number;
  };
}

// Collection types
export interface RiverFeatureCollection extends FeatureCollection {
  features: RiverFeature[];
}

export interface AccessPointFeatureCollection extends FeatureCollection {
  features: AccessPointFeature[];
}

export interface HazardFeatureCollection extends FeatureCollection {
  features: HazardFeature[];
}

// Map viewport
export interface MapViewport {
  center: Coordinates;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

// Bounding box as array [minLng, minLat, maxLng, maxLat]
export type BBox = [number, number, number, number];
