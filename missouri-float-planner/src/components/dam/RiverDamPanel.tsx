// src/components/dam/RiverDamPanel.tsx
// The dam section on a river hub — for a TAILWATER only, meaning a reach whose
// level is the release rather than the weather.
//
// Server component, fed by fetchRiverDam() inside the page's existing
// Promise.all, so it stays inside the hub's `revalidate = 300` and there is no
// client-side flash. Returns null when the river has no dam above it, which is
// every river but the Black today.
//
// The forecast is DAY BOXES, not a chart. Three reasons, in order: it answers
// "for how long" more directly than a line does; the repo ships no charting
// library by choice; and it ports to the iOS app as flexbox, where there is
// neither a chart library nor react-native-svg.
//
// What it must never do is imply the release is a promise. The Corps changes
// schedules for power demand, transmission constraints, outages and inflow,
// and this panel sits next to a number someone may wade into.

import Link from 'next/link';
import { Waves, ExternalLink } from 'lucide-react';
import type { RiverDamContext } from '@/lib/data/dams';

function cfs(n: number): string {
  return Math.round(n).toLocaleString();
}

function dayLabel(iso: string): { weekday: string; date: string } {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' }),
    date: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/Chicago' }),
  };
}

/**
 * Collapse the forecast to at most one point per calendar day.
 *
 * SWL publishes daily already; MVS publishes hourly out ~11 days, and 264
 * boxes would be noise. Taking the day's peak rather than its mean is
 * deliberate — on a regulated river the high-water hour is the one that
 * decides whether you can be out there.
 */
function toDailyPeaks(points: RiverDamContext['forecast']) {
  const byDay = new Map<string, { at: string; cfs: number }>();
  for (const p of points) {
    const key = new Date(p.at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const existing = byDay.get(key);
    if (!existing || p.cfs > existing.cfs) byDay.set(key, p);
  }
  return Array.from(byDay.values()).slice(0, 7);
}

export default function RiverDamPanel({ context }: { context: RiverDamContext | null }) {
  if (!context) return null;

  const { dam, forecast, forecastIsDaily } = context;
  const release = dam.metrics.release;
  const days = toDailyPeaks(forecast);

  // Nothing to say without a current release. Better an absent section than a
  // section explaining its own emptiness.
  if (!release && days.length === 0) return null;

  const current = release?.value ?? null;
  const last = days.length > 0 ? days[days.length - 1].cfs : null;
  const bigSwing =
    current !== null && last !== null && Math.abs(last - current) / current >= 0.25;

  return (
    <div className="rounded-xl border-2 border-t-4 border-primary-800 bg-white p-5 shadow-[4px_4px_0_var(--color-primary-200)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-primary-700" />
          <h3
            className="text-lg font-bold text-neutral-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {dam.name}
          </h3>
        </div>
        <Link
          href={`/dams/${dam.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
        >
          Lake &amp; dam detail
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {release && (
        <div className="mt-3">
          <div className="text-3xl font-bold tabular-nums text-neutral-900">
            {cfs(release.value)} <span className="text-lg font-medium text-neutral-500">cfs</span>
          </div>
          <div className="text-sm text-neutral-600">
            {release.dailyMean ? 'daily average release' : 'releasing now'}
            {release.staleness !== 'fresh' && ' · reading is lagging'}
          </div>
        </div>
      )}

      {days.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-500">
            The Corps&rsquo; release schedule
            {forecastIsDaily ? '' : ' (daily peak)'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => {
              const { weekday, date } = dayLabel(d.at);
              return (
                <div
                  key={d.at}
                  className="min-w-[68px] flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center"
                >
                  <div className="text-[11px] font-medium text-neutral-500">{weekday}</div>
                  <div className="text-[10px] text-neutral-400">{date}</div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums text-neutral-900">
                    {cfs(d.cfs)}
                  </div>
                </div>
              );
            })}
          </div>
          {bigSwing && last !== null && current !== null && (
            <p className="mt-2 text-sm font-medium text-accent-700">
              {last < current ? 'Dropping' : 'Rising'} to about {cfs(last)} cfs by{' '}
              {dayLabel(days[days.length - 1].at).weekday}.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        This reach runs at whatever {dam.name} releases, so it follows the dam
        rather than the rain. Schedules can change without notice — never wade
        or anchor below a dam without checking the horn and posted warnings.
        {dam.sources.length > 0 && ` Source: ${dam.sources.join(' · ')}.`}
      </p>
    </div>
  );
}
