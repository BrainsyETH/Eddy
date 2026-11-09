'use client';

// Reviewed launch locations; review is not a current opening/closure report.

import { useCallback, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import { RAMP_CAUTION_COPY, listingAge } from '@shared/lake-status';
import type { LakeLaunch, LakeSection, LaunchMethod } from '@shared/lake-types';
import { riverAccessPath } from '@/lib/navigation/river-path';
import { generateNavLinks } from '@/lib/navigation/deepLinks';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import Button from '@/components/ui/Button';
import dynamic from 'next/dynamic';
import { lakeReadingIsStale } from '@/lib/lakes/presentation';
const LakeLaunchMap = dynamic(() => import('./LakeLaunchMap'), { ssr: false, loading: () => <p className="p-6 text-sm text-neutral-600">Loading map…</p> });

const AMENITY_ICONS: Record<string, EddyIconName | undefined> = { parking: 'parking', restroom: 'facilities', restrooms: 'facilities', camping: 'campground', campground: 'campground' };

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

function LaunchItem({ launch, now, selected, onSelect, cautionsCurrent }: { launch: LakeLaunch; now: number; selected: boolean; onSelect: () => void; cautionsCurrent: boolean }) {
  const caution = cautionsCurrent && launch.caution ? RAMP_CAUTION_COPY[launch.caution] : null;
  const thresholds = launch.thresholds;
  const directions = directionsHref(launch);
  return (
    <li id={`launch-${launch.id}`} className={`scroll-mt-24 border-t border-neutral-200 py-4 first:border-t-0 ${selected ? 'border-l-4 border-l-accent-500 pl-3' : ''}`} data-launch-id={launch.id}>
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
          <a className="shrink-0 inline-flex min-h-11 items-center rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium text-primary-700 hover:bg-neutral-50" href={directions} target="_blank" rel="noopener noreferrer">
            Directions
          </a>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        {launch.launchMethods.map((m) => (
          <span key={m} className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-800">{METHOD_LABEL[m]}</span>
        ))}
        {launch.amenities.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 px-1 py-1 text-neutral-600">{AMENITY_ICONS[a] && <EddyIcon name={AMENITY_ICONS[a]} size={18} />}{amenityLabel(a)}</span>
        ))}
      </div>
      <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline underline-offset-4" onClick={onSelect}>Show on map</button>
      {thresholds && (
        <p className="mt-1.5 text-xs text-neutral-500">
          {thresholds.bottomFt !== null ? `Ramp bottom ${thresholds.bottomFt.toFixed(0)} ft` : 'Ramp bottom not published'}
          {' · '}
          {thresholds.closureFt !== null ? `Published closure threshold ${thresholds.closureFt.toFixed(0)} ft` : 'closure elevation not published'}
          {` (${thresholds.datum}, ${thresholds.source}${thresholds.sourceUpdatedAt ? `, ${listingAge(thresholds.sourceUpdatedAt, now)}` : ''})`}
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

export default function LakeLaunches({ lake, now }: { lake: LakeSection; now: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const cautionsCurrent = lake.cautionsVerified && Boolean(lake.pool && !lakeReadingIsStale(lake.pool, now));
  const shown = useMemo(() => lake.launches.filter((l) => filter === 'all' || l.launchMethods.includes(filter)), [lake.launches, filter]);
  const selectFromMap = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`launch-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, []);
  function select(id: string) {
    setSelected(id); setShowMap(true);
    requestAnimationFrame(() => document.getElementById('lake-launch-map')?.scrollIntoView({ block: 'nearest' }));
  }
  return <Card as="section" variant="panel" className="p-4 sm:p-6" aria-labelledby="lake-launches-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="lake-launches-heading" className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="boatRamp" size={28} />Boat launches</h2>
      {lake.launches.length > 0 && <Button variant="outline" size="sm" className="min-h-11" aria-expanded={showMap} aria-controls="lake-launch-map" onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'View map'}</Button>}
    </div>
    <p className="mt-2 text-sm text-neutral-600">{lake.launches.length > 0 ? `${lake.launches.length} reviewed ${lake.launches.length === 1 ? 'launch' : 'launches'}. More locations will be added as they are reviewed.` : 'Reviewed launch locations are currently unavailable.'}</p>
    {lake.launches.length > 0 && <>
      <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Filter launches by method">{FILTERS.map(f => <Button key={f.key} variant={filter === f.key ? 'primary' : 'outline'} size="sm" className="min-h-11" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setSelected(null); }}>{f.label}</Button>)}</div>
      {showMap && <div id="lake-launch-map" className="relative mb-4 h-80 overflow-hidden rounded-xl border border-neutral-200"><LakeLaunchMap launches={shown} selected={selected} onSelect={selectFromMap} /></div>}
      <p className="sr-only" role="status">{shown.length} launches shown</p>
      {shown.length ? <ul>{shown.map(launch => <LaunchItem key={launch.id} launch={launch} now={now} selected={selected === launch.id} onSelect={() => select(launch.id)} cautionsCurrent={cautionsCurrent} />)}</ul> : <p className="py-4 text-sm text-neutral-600">No reviewed {filter === 'hand' ? 'hand launches' : 'trailer ramps'} in this list. Try All launches.</p>}
      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs leading-5 text-neutral-500">Reviewed locations are not a report of current opening or closure. Elevation cautions use published thresholds, not an official closure report. Follow the managing agency’s notices.</p>
    </>}
  </Card>;
}
