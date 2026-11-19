// The cron's existing day cells still decide whether a format runs. An optional
// delivery entry in the same JSON column describes that day's time and channels.
import type { PlacementChoice, PlacementChoices } from './placements';
import type { MediaSchedule, SocialPlatform } from './types';

export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = typeof weekdays[number];
export const formatNames = {
  daily_digest: 'Daily Report', section_guide: 'Float Pick', weekly_forecast: 'Weekend Forecast', river_highlight: 'Eddy’s Read',
} as const;
export type PlanFormat = keyof typeof formatNames;
export type Delivery = {
  time: string;
  instagram: PlacementChoice | 'off';
  facebook: PlacementChoice | 'off';
  tiktok: boolean;
};
export type PlanRule = { format: PlanFormat; days: Weekday[]; delivery: Delivery };
export type DayDeliveries = Partial<Record<PlanFormat, Partial<Record<Weekday, Delivery>>>>;

export interface PlanConfig {
  media_schedule: MediaSchedule;
  digest_time_cst?: string;
  section_guide?: { time_cst: string; placements?: PlacementChoices };
  weekly_forecast?: { time_cst: string };
}

export function defaultDelivery(config: PlanConfig, format: PlanFormat): Delivery {
  const placements = format === 'section_guide' ? config.section_guide?.placements : undefined;
  const time = format === 'daily_digest' ? config.digest_time_cst || '14:00'
    : format === 'weekly_forecast' ? config.weekly_forecast?.time_cst || '22:00'
    : format === 'section_guide' ? config.section_guide?.time_cst || '17:00' : '17:00';
  return { time: time.slice(0, 5), instagram: placements?.instagram ?? 'regular', facebook: placements?.facebook ?? 'regular', tiktok: format !== 'daily_digest' };
}

export function deliveryOn(config: PlanConfig, format: PlanFormat, day: Weekday): Delivery {
  return config.media_schedule?.delivery?.[format]?.[day] ?? defaultDelivery(config, format);
}

export function deliveryLabels(format: PlanFormat, delivery: Delivery): string[] {
  const labels: string[] = [];
  for (const platform of ['instagram', 'facebook'] as const) {
    const choice = delivery[platform];
    const name = platform === 'instagram' ? 'Instagram' : 'Facebook';
    if (choice === 'regular' || choice === 'both') labels.push(format === 'daily_digest' ? name + ' carousel' : name + (platform === 'instagram' ? ' Reel' : ' Page video'));
    if (choice === 'story' || choice === 'both') labels.push(name + ' Story');
  }
  if (delivery.tiktok) labels.push('TikTok');
  return labels;
}

export function wantedPlatforms(delivery: Delivery, available: SocialPlatform[]): SocialPlatform[] {
  return available.filter(p => p === 'tiktok' ? delivery.tiktok : delivery[p] !== 'off');
}

export function planRules(config: PlanConfig): PlanRule[] {
  const groups: PlanRule[] = [];
  for (const format of Object.keys(formatNames) as PlanFormat[]) {
    for (const day of weekdays) {
      if (!config.media_schedule?.[format]?.[day] || (format === 'river_highlight' && day !== 'thu')) continue;
      const delivery = deliveryOn(config, format, day);
      const group = groups.find(rule => rule.format === format && rule.delivery.time === delivery.time &&
        rule.delivery.instagram === delivery.instagram && rule.delivery.facebook === delivery.facebook && rule.delivery.tiktok === delivery.tiktok);
      if (group) group.days.push(day);
      else groups.push({ format, days: [day], delivery });
    }
  }
  return groups.sort((a, b) => a.delivery.time.localeCompare(b.delivery.time));
}

export function applyRule(config: PlanConfig, format: PlanFormat, previousDays: Weekday[], days: Weekday[], delivery: Delivery): MediaSchedule {
  const validDay = (day: Weekday) => weekdays.includes(day) && (format !== 'river_highlight' || day === 'thu');
  if (!Object.hasOwn(formatNames, format) || !Array.isArray(previousDays) || !Array.isArray(days) ||
      !previousDays.every(validDay) || !days.every(validDay) || !delivery) {
    throw new Error('Choose valid days, time and destinations for this format.');
  }
  const allowed = format === 'section_guide' ? ['off', 'regular', 'story', 'both'] : ['off', 'regular'];
  const keepLegacyTime = previousDays.length > 0 && previousDays.every(day => deliveryOn(config, format, day).time === delivery.time);
  const validTime = typeof delivery.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(delivery.time) &&
    (keepLegacyTime || /:(00|30)$/.test(delivery.time)) && (format !== 'river_highlight' || delivery.time === '17:00');
  if (!validTime || !allowed.includes(delivery.instagram) || !allowed.includes(delivery.facebook) ||
      typeof delivery.tiktok !== 'boolean' || (format === 'daily_digest' && delivery.tiktok) ||
      (days.length > 0 && !wantedPlatforms(delivery, ['facebook', 'instagram', 'tiktok']).length)) {
    throw new Error('Choose valid destinations and an hour or half hour for this format.');
  }
  const media = config.media_schedule;
  const gates = { ...media[format] };
  const overrides = { ...media.delivery?.[format] };
  if (days.some(day => gates[day] && !previousDays.includes(day))) throw new Error('This format already has a schedule on that day.');
  for (const day of previousDays) { gates[day] = null; delete overrides[day]; }
  for (const day of days) { gates[day] = format === 'daily_digest' ? 'image' : 'video'; overrides[day] = delivery; }
  return { ...media, [format]: gates, delivery: { ...media.delivery, [format]: overrides } };
}
