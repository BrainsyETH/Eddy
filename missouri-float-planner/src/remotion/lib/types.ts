// Input prop types for each Remotion composition

export type ConditionCode =
  | 'optimal'
  | 'okay'
  | 'low'
  | 'too_low'
  | 'high'
  | 'dangerous'
  | 'unknown';

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface GaugeAnimationProps {
  riverName: string;
  gaugeHeight: number;
  discharge: number | null;
  conditionCode: ConditionCode;
  eddyQuote: string;
  trendDirection: TrendDirection;
  optimalMin: number;
  optimalMax: number;
  dangerousLevel: number;
  unit: 'ft' | 'cfs';
}

export interface ConditionAlertProps {
  riverName: string;
  previousCondition: ConditionCode;
  newCondition: ConditionCode;
  gaugeHeight: number;
  discharge: number | null;
  eddyQuote: string;
}

export interface RiverDigestEntry {
  name: string;
  conditionCode: ConditionCode;
  gaugeHeight: number;
  trendDirection: TrendDirection;
}

export interface DailyDigestProps {
  rivers: RiverDigestEntry[];
  weatherSummary: string;
  topPickRiver: string;
  topPickCondition: ConditionCode;
  globalQuote: string;
  date: string; // e.g. "March 22, 2026"
}
