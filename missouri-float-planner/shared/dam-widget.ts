// Clocked WidgetKit presentation uses the dam page's canonical rules. Cached
// timelines carry local expiry transitions even when iOS defers network refresh.
import type { DamSnapshot } from './dam-types';
import { generationNow, generationStatusLabel, scheduledChangeSummary } from './dam-generation';
import { oldestRetrievedAt, scheduleIsStale, SCHEDULE_STALE_AFTER_MINUTES, READING_LAGGING_AFTER_HOURS } from './dam-schedule-copy';

export function damWidgetSnapshot(dam: DamSnapshot, now = Date.now()) {
  const metric = dam.metrics.generationFlow;
  const observedAt = metric ? Date.parse(metric.at) : NaN;
  const usable = metric && !metric.dailyMean && Number.isFinite(metric.value) && metric.value >= 0
    && Number.isFinite(observedAt) && observedAt <= now + 300_000;
  const input = { ...dam, metrics: { ...dam.metrics, generationFlow: usable ? metric : undefined } };
  const checked = oldestRetrievedAt(dam.schedule);
  const checkedAt = checked ? Date.parse(checked) : NaN;
  const scheduleKnown = dam.schedule.length > 0 && dam.schedule.every(day => {
    const at = day.retrievedAt ? Date.parse(day.retrievedAt) : NaN;
    return Number.isFinite(at) && at <= now + 300_000;
  });
  const clocks = new Set([now, now + 86_400_000]);
  for (let hour = 1; hour <= 24; hour++) clocks.add(Math.floor(now / 3_600_000) * 3_600_000 + hour * 3_600_000);
  for (const expires of [observedAt + READING_LAGGING_AFTER_HOURS * 3_600_000 + 1,
    checkedAt + SCHEDULE_STALE_AFTER_MINUTES * 60_000 + 1]) {
    if (Number.isFinite(expires) && expires > now && expires < now + 86_400_000) clocks.add(expires);
  }
  return {
    version: 1, id: dam.id, name: dam.name,
    entries: [...clocks].sort((a, b) => a - b).map(date => {
      const state = generationNow(input, date);
      const scheduleCurrent = scheduleKnown && !scheduleIsStale(checked, date);
      return {
        date, status: generationStatusLabel(state) ?? 'No powerhouse',
        turbineCfs: state.kind === 'unavailable' ? null : state.turbineCfs,
        observedAt: state.kind === 'unavailable' ? null : observedAt,
        current: state.kind !== 'unavailable' && state.age === 'fresh',
        scheduleSummary: scheduleCurrent
          ? scheduledChangeSummary(dam.schedule, dam.generationReference, date) ?? 'No upcoming schedule posted.'
          : dam.schedule.length ? 'Open Eddy to check the latest schedule.' : 'No schedule posted.',
        scheduleCurrent, scheduleCheckedAt: Number.isFinite(checkedAt) ? checkedAt : null,
      };
    }),
  };
}
