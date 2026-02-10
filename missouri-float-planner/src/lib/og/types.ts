// src/lib/og/types.ts
// Shared types for OG image generation

export type ConditionCode =
  | 'dangerous'
  | 'high'
  | 'optimal'
  | 'okay'
  | 'low'
  | 'too_low'
  | 'unknown';

export interface StatusStyle {
  solid: string;
  text: string;
  bg: string;
  border: string;
  label: string;
}

export interface RiverOGData {
  name: string;
  accessPointCount: number;
  gaugeReading: number | null;
  gaugeUnit: string;
  gaugeStatus: ConditionCode;
}

export interface AccessPointOGData {
  name: string;
  type: 'Public' | 'Private';
  riverName: string;
  gaugeStatus: ConditionCode;
  floatable: boolean;
}

export interface GaugeOGData {
  stationName: string;
  stationId: string;
  reading: number | null;
  unit: string;
  status: ConditionCode;
  associatedRivers: string[];
}

export interface FloatPlanOGData {
  river: string;
  putIn: string;
  takeOut: string;
  condition: ConditionCode;
  gaugeName: string;
  gaugeHeight: string | null;
}
