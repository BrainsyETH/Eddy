'use client';

// The lake behind the dam: level, how it moved, where it sits against the
// documented pools, and the reviewed launches. ADR 0019 rules hold here:
// a signed change, never "rising"; a threshold caution, never "available";
// the age of anything reported, at a glance.

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { relativeAge } from '@shared/dam-schedule-copy';
import { RAMP_CAUTION_COPY, levelChangeLabel, listingAge, poolPositionSentence } from '@shared/lake-status';
import type { LakeLaunch, LakeSection, LaunchMethod } from '@shared/lake-types';

type Filter = 'all' | LaunchMethod;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All launches' },
  { key: 'trailer', label: 'Trailer' },
  { key: 'hand', label: 'Hand launch' },
];

const METHOD_LABEL: Record<LaunchMethod, string> = { trailer: 'Trailer ramp', hand: 'Hand launch' };

function amenityLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function LaunchItem({ launch }: { launch: LakeLaunch }) {
  const caution = launch.caution ? RAMP_CAUTION_COPY[launch.caution] : null;
  const thresholds = launch.thresholds;
  return (
    <li className="border-t border-neutral-200 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-neutral-900">
          {launch.accessPoint ? (
            <a className="underline decoration-neutral-300 underline-offset-2 hover:decoration-primary-600" href={`/rivers/${launch.accessPoint.riverSlug}/access/${launch.accessPoint.slug}`}>{launch.name}</a>
          ) : launch.name}
        </span>
        <span className="text-xs text-neutral-500">
          {launch.managingAgency ?? 'Operator not recorded'}
          {launch.feeRequired === true ? ' · fee' : launch.feeRequired === false ? ' · no fee' : ''}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        {launch.launchMethods.length === 0 && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">Launch method not yet reviewed</span>}
        {launch.launchMethods.map((m) => (
          <span key={m} className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-800">{METHOD_LABEL[m]}</span>
        ))}
        {launch.amenities.map((a) => (
          <span key={a} className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{amenityLabel(a)}</span>
        ))}
      </div>
      {thresholds && (
        <p className="mt-1.5 text-xs text-neutral-500">
          {thresholds.bottomFt !== null ? `Ramp bottom ${thresholds.bottomFt.toFixed(0)} ft` : 'Ramp bottom not published'}
          {' · '}
          {thresholds.closureFt !== null ? `closed above ${thresholds.closureFt.toFixed(0)} ft` : 'closure elevation not published'}
          {` (${thresholds.datum}, ${thresholds.source}${thresholds.sourceUpdatedAt ? `, ${listingAge(thresholds.sourceUpdatedAt)}` : ''})`}
        </p>
      )}
      {caution && (
        <div className="mt-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs text-accent-900" role="note">
          <p className="font-semibold">{caution.title}</p>
          <p className="mt-0.5">{caution.body}</p>
          <p className="mt-0.5 text-accent-800">{caution.basis}</p>
        </div>
      )}
    </li>
  );
}

export default function OnTheLake({ lake, now }: { lake: LakeSection; now: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const pool = lake.pool;
  const range = lake.operatingRange ? { conservationFt: lake.operatingRange.conservationFt, floodFt: lake.operatingRange.floodFt } : null;
  const shown = lake.launches.filter((l) => filter === 'all' || l.launchMethods.includes(filter));
  const age = pool ? relativeAge(pool.at, now) : null;

  return (
    <Card as="section" variant="panel" className="min-w-0 p-5 sm:p-6" data-lake-section={lake.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>On the lake</h2>
        <span className="text-xs text-neutral-500">{lake.name} · {lake.states.join(' / ')}</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium text-neutral-500">Lake level</div>
          {pool ? (
            <>
              <div className={`mt-1 font-mono text-xl text-primary-800${pool.staleness === 'stale' ? ' opacity-70' : ''}`}>
                {pool.valueFt.toFixed(2)} <span className="font-sans text-xs text-neutral-600">ft {lake.datum}</span>
              </div>
              <div className="text-xs text-neutral-500">
                {pool.daily ? 'Daily report' : 'Reading'}{age ? ` · ${age}` : ''}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-neutral-600">No current reading.</div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-neutral-500">Change</div>
          <div className="mt-1 text-sm text-neutral-800">
            {levelChangeLabel(lake.change24hFt ?? null, 24) ?? 'Not enough recorded readings for a 24-hour change.'}
          </div>
          <div className="text-sm text-neutral-800">
            {levelChangeLabel(lake.change7dFt ?? null, 168) ?? 'Not enough recorded readings for a 7-day change.'}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-neutral-500">Against the pools</div>
          <div className="mt-1 text-sm text-neutral-800">
            {pool ? poolPositionSentence(lake.poolPosition ?? null, pool.valueFt, range) : 'Operating range needs a current reading.'}
          </div>
          {lake.operatingRange && (
            <div className="text-xs text-neutral-500">
              Conservation {lake.operatingRange.conservationFt.toFixed(0)} ft · flood {lake.operatingRange.floodFt.toFixed(0)} ft
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Launches</h3>
        <div className="flex gap-1" role="group" aria-label="Filter launches by method">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-3 py-1 text-xs ${filter === f.key ? 'bg-primary-700 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {lake.launches.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No reviewed launches yet. Places are published one at a time after review.</p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No reviewed {filter === 'hand' ? 'hand launches' : 'trailer ramps'} on this lake yet.</p>
      ) : (
        <ul className="mt-2">
          {shown.map((launch) => <LaunchItem key={launch.id} launch={launch} />)}
        </ul>
      )}
      <p className="mt-4 text-xs text-neutral-500">
        Launch status from agencies is shown only with the agency&apos;s own date. Elevation cautions are based on published thresholds and are not closure reports
        {lake.cautionsVerified ? '.' : '; they are switched off for this lake until its thresholds are verified.'}
      </p>
    </Card>
  );
}
