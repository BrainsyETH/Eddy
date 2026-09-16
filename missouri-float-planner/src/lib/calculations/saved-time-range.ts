import { formatFloatTimeRange } from './floatTime';

export function validTimeRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { min, max } = value as { min: unknown; max: unknown };
  return typeof min === 'number' && typeof max === 'number'
    && Number.isInteger(min) && Number.isInteger(max) && min > 0 && max >= min
    ? { min: Math.round(min), max: Math.round(max) } : null;
}

export function savedTimeRangeLabel(plan: {
  estimated_float_min_minutes?: number | null;
  estimated_float_max_minutes?: number | null;
}): string | null {
  const range = validTimeRange({ min: plan.estimated_float_min_minutes, max: plan.estimated_float_max_minutes });
  return range ? formatFloatTimeRange(range.min, range.max) : null;
}
