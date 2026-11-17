import type { LakeSection } from '@shared/lake-types';
import { poolPositionSentence } from '@shared/lake-status';

const centralDateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

/**
 * USACE's published Table Rock power-pool calendar, in Central local time.
 * https://www.swl-wc.usace.army.mil/pages/data/tabular/htm/tabrock.htm
 * Jan–Apr 30: 915; Apr 30–May 1: 915→916; May 1–Jun 1: 916→917;
 * Jun 1–Nov 30: 917; Nov 30–Dec 1: 917→915; December: 915 ft NGVD29.
 * Compare against the observation's date, never today's date for an old reading.
 * Kept on web: this does not change the lake registry or the iOS/API contract.
 */
export function tableRockSeasonalPoolFt(at: string): number | null {
  if (!Number.isFinite(Date.parse(at))) return null;
  const parts = centralDateParts.formatToParts(new Date(at));
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const month = part('month'), day = part('day');
  const fraction = (part('hour') * 60 + part('minute')) / 1440;
  if (month === 4 && day === 30) return 915 + fraction;
  if (month === 5) return 916 + (day - 1 + fraction) / 31;
  if (month >= 6 && month <= 11) return month === 11 && day === 30 ? 917 - 2 * fraction : 917;
  return 915;
}

/** A single web reference for the illustration, lake summary and history. */
export function lakePoolPositionSentence(lake: LakeSection): string | null {
  if (!lake.pool) return null;
  if (lake.slug !== 'table-rock') return poolPositionSentence(lake.poolPosition ?? null, lake.pool.valueFt, lake.operatingRange ?? null);
  const ref = tableRockSeasonalPoolFt(lake.pool.at);
  if (ref === null) return null;
  const delta = lake.pool.valueFt - ref;
  return Math.abs(delta) < .05 ? `At the ${ref.toFixed(1)} ft seasonal pool.`
    : `${Math.abs(delta).toFixed(1)} ft ${delta < 0 ? 'below' : 'above'} the ${ref.toFixed(1)} ft seasonal pool.`;
}
