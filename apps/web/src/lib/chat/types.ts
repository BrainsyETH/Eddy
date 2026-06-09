// src/lib/chat/types.ts
// TypeScript types for the Eddy chat feature

import type { ConditionCode } from '@/types/api';

/** Message roles in the chat */
export type ChatRole = 'user' | 'assistant';

/** A single chat message for the UI */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCallStatus[];
  /** Structured tool result data for rendering rich visual cards */
  toolData?: ToolResultData[];
  timestamp: number;
}

/** A structured tool result that can be rendered as a rich card */
export interface ToolResultData {
  tool: string;
  data: Record<string, unknown>;
}

/** Tracks tool call status for UI feedback */
export interface ToolCallStatus {
  name: string;
  label: string;
  status: 'calling' | 'done' | 'error';
  /** Number of calls with this label (for dedup display) */
  count?: number;
  /** Number completed so far */
  doneCount?: number;
}

/** SSE event types sent from /api/chat */
export type SSEEventType = 'text' | 'tool_start' | 'tool_end' | 'tool_data' | 'done' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  content?: string;
  tool?: string;
  label?: string;
  message?: string;
  /** Structured tool result data for rich cards */
  data?: Record<string, unknown>;
}

/** Request body for POST /api/chat */
export interface ChatRequest {
  messages: { role: ChatRole; content: string }[];
  riverSlug?: string;
}

/** Tool result data shapes */

export interface RiverConditionsResult {
  riverName: string;
  riverSlug: string;
  gaugeName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  optimalRange: string;
  trend: string | null;
  trendDetail: string | null;
  readingTimestamp: string | null;
}

export interface AccessPointResult {
  name: string;
  riverMile: number;
  type: string;
  types: string[];
  amenities: string[];
  parkingInfo: string | null;
  roadAccess: string | null;
  feeRequired: boolean;
  description: string | null;
  coordinates: { lat: number; lng: number } | null;
}

export interface FloatRouteResult {
  startPoint: string;
  endPoint: string;
  distanceMiles: number;
  estimatedHours: { low: number; high: number };
  shuttleDriveMinutes: number | null;
  hazards: HazardResult[];
}

export interface HazardResult {
  name: string;
  type: string;
  severity: string;
  riverMile: number;
  description: string | null;
  portageRequired: boolean;
}

export interface WeatherResult {
  current: {
    temp: number;
    condition: string;
    windSpeed: number;
    humidity: number;
  };
  forecast: {
    dayOfWeek: string;
    tempHigh: number;
    tempLow: number;
    condition: string;
    precipitation: number;
  }[];
  alerts: {
    event: string;
    severity: string;
    headline: string;
    description: string;
  }[];
}

export interface NearbyServiceResult {
  name: string;
  type: string;
  phone: string | null;
  website: string | null;
  servicesOffered: string[];
  description: string | null;
  seasonalNotes: string | null;
  sectionDescription: string | null;
}

/** Human-readable labels for tool status messages */
export const TOOL_LABELS: Record<string, string> = {
  get_river_conditions: 'Checking conditions...',
  get_access_points: 'Looking up access points...',
  get_float_route: 'Calculating float route...',
  get_river_hazards: 'Checking for hazards...',
  get_weather: 'Checking the weather...',
  get_nearby_services: 'Finding nearby services...',
  web_search: 'Searching the web...',
  get_eddy_report: 'Reading latest Eddy report...',
};
