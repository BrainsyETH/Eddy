import { hasMaterialConditionChange } from '@/lib/conditions';

export const GAUGE_REPORT_REGEN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const GAUGE_REPORT_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_GAUGE_REPORTS_PER_WINDOW = 4; // daily baseline + up to three event updates
export const MAX_GAUGE_REGENS_PER_POLL = 3;
export const GAUGE_REPORT_READING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isGaugeReportCompatible({
  storedCondition,
  liveCondition,
  readingTimestamp,
  now = new Date(),
}: {
  storedCondition: string;
  liveCondition: string;
  readingTimestamp: string | null;
  now?: Date;
}): boolean {
  if (!readingTimestamp) return false;
  const readingTime = new Date(readingTimestamp).getTime();
  if (!Number.isFinite(readingTime) || now.getTime() - readingTime > GAUGE_REPORT_READING_MAX_AGE_MS) return false;
  return !hasMaterialConditionChange(storedCondition, liveCondition);
}

export function canRegenerateGaugeReport({
  latestGeneratedAt,
  reportsInRollingWindow,
  now = new Date(),
}: {
  latestGeneratedAt: string | null;
  reportsInRollingWindow: number;
  now?: Date;
}): boolean {
  if (reportsInRollingWindow >= MAX_GAUGE_REPORTS_PER_WINDOW) return false;
  if (!latestGeneratedAt) return true;
  const latestTime = new Date(latestGeneratedAt).getTime();
  return !Number.isFinite(latestTime) || now.getTime() - latestTime >= GAUGE_REPORT_REGEN_COOLDOWN_MS;
}

export function confirmsGaugeConditionChange({
  storedCondition,
  liveCondition,
  previousCondition,
}: {
  storedCondition: string;
  liveCondition: string;
  previousCondition: string | null;
}): boolean {
  if (!hasMaterialConditionChange(storedCondition, liveCondition)) return false;
  if (liveCondition === 'high' || liveCondition === 'dangerous') {
    return previousCondition === liveCondition;
  }
  return true;
}
