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
import { riverAccessPath } from '@/lib/navigation/river-path';
import { generateNavLinks } from '@/lib/navigation/deepLinks';
import LakeLevelChart from './LakeLevelChart';

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

/** Google Maps directions to the launch, the same builder the access pages use. Opens in a new tab. */
function directionsHref(launch: LakeLaunch): string | null {
  const google = generateNavLinks({ lat: launch.lat, lng: launch.lon, label: launch.name }).find((l) => l.app === 'google');
  return google?.webFallback ?? null;
}

function LaunchItem({ launch }: { launch: LakeLaunch }) {
  const caution = launch.caution ? RAMP_CAUTION_COPY[launch.caution] : null;
  const thresholds = launch.thresholds;
  const directions = directionsHref(launch);
  return (
    <li className="border-t border-neutral-200 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-neutral-900">
            {launch.accessPoint ? (
              <a className="underline decoration-neutral-300 underline-offset-2 hover:decoration-primary-600" href={riverAccessPath(launch.accessPoint.state, launch.accessPoint.riverSlug, launch.accessPoint.slug)}>{launch.name}</a>
            ) : launch.name}
          </div>
          <div className="text-xs text-neutral-500">
            {launch.managingAgency ?? 'Operator not recorded'}
            {launch.feeRequired === true ? ' · fee' : launch.feeRequired === false ? ' · no fee' : ''}
          </div>
        </div>
        {directions && (
          <a className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-neutral-50" href={directions} target="_blank" rel="noopener noreferrer">
            Directions
          </a>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
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
  const change24 = levelChangeLabel(lake.change24hFt ?? null, 24);
  const change7 = levelChangeLabel(lake.change7dFt ?? null, 168);

  return (
    <Card as="section" variant="panel" className="min-w-0 p-5 sm:p-6" data-lake-section={lake.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>On the lake</h2>
        <span className="text-xs text-neutral-500">{lake.name} · {lake.states.join(' / ')}</span>
      </div>

      {pool ? (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="text-xs font-medium text-neutral-500">Lake level</div>
            <div className={`mt-1 font-mono text-3xl text-primary-900${pool.staleness === 'stale' && !pool.daily ? ' opacity-70' : ''}`}>
              {pool.valueFt.toFixed(2)} <span className="font-sans text-sm text-neutral-600">ft {lake.datum}</span>
            </div>
            <div className="text-xs text-neutral-600">
              {pool.daily ? 'Daily report' : 'Reading'}{age ? ` · ${age}` : ''}
              {' · '}
              {poolPositionSentence(lake.poolPosition ?? null, pool.valueFt, range)}
            </div>
          </div>
          <div className="text-sm text-neutral-800">
            {change24 && <div>{change24}</div>}
            {change7 && <div>{change7}</div>}
            {!change24 && !change7 && <div className="text-xs text-neutral-500">Change over a day and a week appears once Eddy has recorded enough readings.</div>}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">No current lake-level reading.</p>
      )}

      <LakeLevelChart history={lake.history} conservationFt={lake.operatingRange?.conservationFt} now={now} timeZone={lake.timeZone} datum={lake.datum} />

      {lake.launches.length > 0 && (
        <>
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
          {shown.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">No reviewed {filter === 'hand' ? 'hand launches' : 'trailer ramps'} on this lake yet.</p>
          ) : (
            <ul className="mt-2">
              {shown.map((launch) => <LaunchItem key={launch.id} launch={launch} />)}
            </ul>
          )}
          <p className="mt-4 text-xs text-neutral-500">
            Launches are published one at a time after review. Elevation figures are the managing agency&apos;s published thresholds
            {lake.cautionsVerified ? ', and a caution drawn from them is not a closure report.' : '; cautions drawn from them stay off for this lake until the thresholds are verified.'}
          </p>
        </>
      )}
    </Card>
  );
}
