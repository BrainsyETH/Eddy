'use client';

// Reviewed launch locations; review is not a current opening/closure report.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Card from '@/components/ui/Card';
import { RAMP_CAUTION_COPY, listingAge } from '@shared/lake-status';
import type { LakeLaunch, LakeSection, LaunchMethod } from '@shared/lake-types';
import { riverAccessPath } from '@/lib/navigation/river-path';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import Button from '@/components/ui/Button';
import Segmented from '@/components/ui/Segmented';
import Badge from '@/components/ui/Badge';
import { LocateFixed, Navigation, MapPin } from 'lucide-react';
import { launchDistanceLabel, launchMethodFilterUseful, orderLaunches } from '@shared/lake-launch-order';
import dynamic from 'next/dynamic';
import { lakeReadingIsStale } from '@/lib/lakes/presentation';
import { launchPhoto } from '@/lib/lakes/photography';
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

/** Open route planning to the reviewed ramp coordinate, using the visitor's origin. */
function directionsHref(launch: LakeLaunch): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${launch.lat},${launch.lon}`)}`;
}

type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable' | 'unsupported';

function LaunchItem({ launch, lakeSlug, now, selected, onSelect, cautionsCurrent, thresholdsVerified, miles }: { launch: LakeLaunch; lakeSlug: string; now: number; selected: boolean; onSelect: () => void; cautionsCurrent: boolean; thresholdsVerified: boolean; miles?: number }) {
  const caution = cautionsCurrent && launch.caution ? RAMP_CAUTION_COPY[launch.caution] : null;
  const thresholds = thresholdsVerified ? launch.thresholds : undefined;
  const directions = directionsHref(launch);
  const photo = launchPhoto(lakeSlug, launch.slug);
  return (
    <li id={`launch-${launch.id}`} className={`scroll-mt-24 border-t border-neutral-200 py-3 first:border-t-0 ${selected ? 'border-l-4 border-l-accent-500 pl-3' : ''}`} data-launch-id={launch.id}>
      <div className="lake-launch-row">
        <div className="lake-launch-art">{photo ? <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 640px) 112px, 72px" className="object-cover" /> : <EddyIcon name="boatRamp" size={48} />}</div>
        <div className="min-w-0">
          <div className="font-heading text-base font-bold text-primary-900">
            {launch.accessPoint ? (
              <a className="underline decoration-neutral-300 underline-offset-2 hover:decoration-primary-600" href={riverAccessPath(launch.accessPoint.state, launch.accessPoint.riverSlug, launch.accessPoint.slug)}>{launch.name}</a>
            ) : launch.name}
          </div>
          {miles !== undefined && <p className="mt-0.5 text-xs font-medium text-neutral-600" data-launch-distance>{launchDistanceLabel(miles)}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            {launch.launchMethods.map(m => <Badge key={m} tone="primary">{METHOD_LABEL[m]}</Badge>)}
            {launch.amenities.map(a => <span key={a} className="inline-flex items-center gap-1 text-neutral-600">{AMENITY_ICONS[a] && <EddyIcon name={AMENITY_ICONS[a]} size={18} />}{amenityLabel(a)}</span>)}
          </div>
          {(launch.managingAgency || launch.feeRequired !== null || thresholds) && <details className="mt-1 text-xs text-neutral-600">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-medium">Launch details <span aria-hidden="true">⌄</span></summary>
            <p className="pb-2">{launch.managingAgency ?? 'Operator not recorded'}{launch.feeRequired === true ? ' · Fee required' : launch.feeRequired === false ? ' · No launch fee' : ''}</p>
            {thresholds && <p className="pb-2 leading-relaxed">
              {thresholds.bottomFt !== null ? `Ramp bottom ${thresholds.bottomFt.toFixed(0)} ft` : 'Ramp bottom not published'}
              {' · '}
              {thresholds.closureFt !== null ? `Published closure threshold ${thresholds.closureFt.toFixed(0)} ft` : 'closure elevation not published'}
              {` (${thresholds.datum}, ${thresholds.source}${thresholds.sourceUpdatedAt ? `, ${listingAge(thresholds.sourceUpdatedAt, now)}` : ''})`}
            </p>}
          </details>}
        </div>
        <div className="lake-launch-actions">
          <Button href={directions} variant="outline" size="sm" className="min-h-11" target="_blank" rel="noopener noreferrer"><Navigation className="size-4" aria-hidden="true" />Directions<span className="sr-only"> to {launch.name}</span></Button>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={onSelect}><MapPin className="size-4" aria-hidden="true" />Show on map<span className="sr-only">: {launch.name}</span></Button>
        </div>
      </div>
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
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const showFilter = launchMethodFilterUseful(lake.launches);
  const cautionsCurrent = lake.cautionsVerified && Boolean(lake.pool && !lakeReadingIsStale(lake.pool, now));
  // Nearest first once the reader shares a location; by name until then.
  const shown = useMemo(() => orderLaunches(lake.launches.filter((l) => filter === 'all' || l.launchMethods.includes(filter)), location), [lake.launches, filter, location]);
  const shownLaunches = useMemo(() => shown.map((entry) => entry.launch), [shown]);
  // Asked for on a tap, never on load: a lake page has no business prompting for location unasked.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoStatus('unsupported'); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => { setLocation({ lat: position.coords.latitude, lon: position.coords.longitude }); setGeoStatus('granted'); },
      // Only a refusal is "off". A timeout or no fix is a different problem with a different remedy.
      (error) => setGeoStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);
  // The "Nearest first" button leaves once it has sorted the list. Hand focus
  // to the line that says what happened, or a keyboard reader is dropped at the top of the page.
  const orderNote = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (geoStatus === 'granted') orderNote.current?.focus(); }, [geoStatus]);
  const selectFromMap = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`launch-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, []);
  function select(id: string) {
    setSelected(id); setShowMap(true);
    requestAnimationFrame(() => document.getElementById('lake-launch-map')?.scrollIntoView({ block: 'nearest' }));
  }
  return <Card as="section" variant="panel" className="scroll-mt-24 p-4 sm:p-6" id="boat-launches" aria-labelledby="lake-launches-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="lake-launches-heading" className="flex items-center gap-2 font-heading text-xl font-bold text-primary-800"><EddyIcon name="boatRamp" size={28} />Boat launches</h2>
      {lake.launches.length > 0 && <Button variant="outline" size="sm" className="min-h-11" aria-expanded={showMap} aria-controls="lake-launch-map" onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'View map'}</Button>}
    </div>
    <p className="mt-2 text-sm text-neutral-600">{lake.launches.length > 0 ? `${lake.launches.length} reviewed ${lake.launches.length === 1 ? 'launch' : 'launches'} · More locations coming as we review them.` : 'Reviewed launch locations are currently unavailable.'}</p>
    {lake.launches.length > 0 && <>
      <div className="my-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {showFilter && <Segmented className="lake-launch-filter max-w-full" stretch aria-label="Filter launches by method" options={FILTERS.map(f => ({ value: f.key, label: f.label }))} value={filter} onChange={value => { setFilter(value); setSelected(null); }} />}
        {geoStatus !== 'granted' && <Button variant="outline" size="sm" className="min-h-11" onClick={requestLocation} disabled={geoStatus === 'locating'}><LocateFixed className="size-4" aria-hidden="true" />{geoStatus === 'locating' ? 'Finding you…' : 'Nearest first'}</Button>}
        <p ref={orderNote} tabIndex={-1} className="text-xs text-neutral-600 focus-visible:outline-none" role="status" data-launch-order>{geoStatus === 'granted' ? 'Nearest first. Distances are straight-line, not the drive.' : geoStatus === 'denied' ? 'Location is off, so launches stay in name order.' : geoStatus === 'unavailable' ? 'Couldn’t find your location, so launches stay in name order.' : geoStatus === 'unsupported' ? 'This browser cannot share a location.' : ''}</p>
      </div>
      {showMap && <div id="lake-launch-map" className="relative mb-4 h-80 overflow-hidden rounded-xl border border-neutral-200"><LakeLaunchMap launches={shownLaunches} selected={selected} onSelect={selectFromMap} /></div>}
      <p className="sr-only" role="status">{shown.length} launches shown</p>
      {shown.length ? <ul>{shown.map(({ launch, miles }) => <LaunchItem key={launch.id} launch={launch} miles={miles} lakeSlug={lake.slug} now={now} selected={selected === launch.id} onSelect={() => select(launch.id)} cautionsCurrent={cautionsCurrent} thresholdsVerified={lake.cautionsVerified} />)}</ul> : <p className="py-4 text-sm text-neutral-600">No reviewed {filter === 'hand' ? 'hand launches' : 'trailer ramps'} in this list. Try All launches.</p>}
      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs leading-5 text-neutral-500">Reviewed locations are not a report of current opening or closure. {lake.cautionsVerified && 'Elevation cautions use published thresholds, not an official closure report. '}Follow the managing agency’s notices.</p>
    </>}
  </Card>;
}
