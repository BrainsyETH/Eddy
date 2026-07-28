// src/components/dam/DamStateCard.tsx
// A dam's current state — the headline block on /dams/[damId] and the row on
// /dams. Server component: everything here is read-through data with no
// interaction, so there is nothing to hydrate.
//
// The copy discipline this file enforces is the whole point:
//
//  - A metric the dam does not publish is ABSENT from `metrics`, and absent
//    renders NOTHING. Clearwater has no powerhouse, so it must not show a
//    "Generation: 0 cfs" tile implying the turbines are merely idle.
//  - Generating vs idle is the fact a wading angler needs first, so it leads.
//  - A daily-mean release (MVS publishes release that way, about a day behind)
//    is labelled as such. Showing it as "releasing now" would be a correctness
//    bug, not a cosmetic one.
//  - Stale readings drop their emphasis rather than being hidden — a number
//    with an honest age beats no number.

import { Waves, Zap, Thermometer, Droplets } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

function relativeAge(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1.5) return 'in the last hour';
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function Stat({
  icon,
  label,
  value,
  sub,
  dim,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string | null;
  dim?: boolean;
}) {
  return (
    <div className={dim ? 'opacity-60' : undefined}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function DamStateCard({ dam }: { dam: DamSnapshot }) {
  const { metrics } = dam;
  const release = metrics.release;
  const generation = metrics.generationFlow;
  const pool = metrics.poolElevation;
  const floodPool = metrics.pctFloodPool;
  const tailwaterTemp = metrics.tailwaterTempF;

  // Only a dam that actually reports turbine flow can claim a generating
  // state. `null` means "we don't know", which is different from "idle".
  const generating = dam.generating;

  return (
    <div className="rounded-xl border-2 border-t-4 border-primary-800 bg-white p-5 shadow-[4px_4px_0_var(--color-primary-200)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-xl font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {dam.name}
        </h2>
        <span className="text-xs text-neutral-500">
          {dam.lakeName ?? 'USACE project'} · {dam.state}
        </span>
      </div>

      {generating !== null && (
        <div className="mt-3">
          <span
            className={
              generating
                ? 'inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-100 px-3 py-1 text-sm font-bold text-accent-800'
                : 'inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-bold text-neutral-700'
            }
          >
            <Zap className="h-3.5 w-3.5" />
            {generating ? 'Generating' : 'Not generating'}
          </span>
          {generation && (
            <span className="ml-2 text-sm tabular-nums text-neutral-600">
              {formatCfs(generation.value)} through the turbines
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {release && (
          <Stat
            icon={<Waves className="h-3.5 w-3.5" />}
            label={release.dailyMean ? 'Release (daily avg)' : 'Releasing'}
            value={formatCfs(release.value)}
            sub={
              release.dailyMean
                ? `daily average, ${relativeAge(release.at)}`
                : relativeAge(release.at)
            }
            dim={release.staleness === 'stale'}
          />
        )}
        {pool && (
          <Stat
            icon={<Droplets className="h-3.5 w-3.5" />}
            label="Lake level"
            value={`${pool.value.toFixed(2)} ft`}
            sub={floodPool ? `${floodPool.value.toFixed(0)}% flood pool` : relativeAge(pool.at)}
            dim={pool.staleness === 'stale'}
          />
        )}
        {tailwaterTemp && (
          <Stat
            icon={<Thermometer className="h-3.5 w-3.5" />}
            label="Tailwater"
            value={`${tailwaterTemp.value.toFixed(1)} °F`}
            sub={tailwaterTemp.value < 60 ? 'cold — trout water' : null}
            dim={tailwaterTemp.staleness === 'stale'}
          />
        )}
      </div>

      {Object.keys(metrics).length === 0 && (
        // Stockton and Truman are SWPA-only: the Kansas City district
        // publishes no timeseries at all, so there are no levels to show.
        <p className="mt-3 text-sm text-neutral-500">
          The Corps does not publish live levels for this project. The generation
          schedule below is the available data.
        </p>
      )}
    </div>
  );
}
