'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, ExternalLink, MapPin, Share2, Users, X } from 'lucide-react';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { TrackedCampground } from '@/lib/camping/overview-types';
import type { CampingStayResult, CampsiteStay } from '../../../shared/camping-stay';
import { campingPolicyNote, campingStayLabel, currentPolicyStay } from '../../../shared/camping-policy';
import { compactStay, filteredStay, siteFlags, stayLabel, type WebSiteFilter } from '@/lib/camping/web-search';
import { MAX_AGE_MS } from '@/lib/camping/freshness';
import { loadCampgroundSites } from '@/lib/camping/web-detail-cache';
import SitePhotos from './SitePhotos';
import styles from './CampgroundDetails.module.css';

const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
});
function siteName(name: string | null, campground: string) {
  const text = name?.trim() || 'Campsite';
  return text.toLowerCase().startsWith(`${campground.toLowerCase()} - `)
    ? text.slice(campground.length + 3).trim() : text;
}
function siteType(type: string | null) {
  if (!type) return null;
  return type.toLowerCase().replace(/^standard\s+/, '').replace(/nonelectric/g, 'non-electric')
    .replace(/\brv\b/g, 'RV').replace(/^./, char => char.toUpperCase());
}
function statusLabel(entry: CampsiteStay) {
  if (entry.state === 'available') return 'Available';
  if (entry.state === 'first_come') return 'First come';
  return campingStayLabel(entry).replace(' for your stay', '');
}

export default function CampgroundDetails({ camp, facilities, arrival, departure, filters, clock, close }: {
  camp: TrackedCampground; facilities: TrackedCampground[];
  arrival: string; departure: string; filters: WebSiteFilter[]; clock: number; close: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const nights = Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000);
  const image = facilities.find(f => f.imageUrl)?.imageUrl;
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function share() {
    setShareError(false);
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: camp.name, url: window.location.href });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch { setShareError(true); }
  }
  return (
    <>
      <header>
        <div className={`${styles.cover} ${!image || imageFailed ? styles.coverFallback : ''}`}>
          {image && !imageFailed ? (
            <Image src={image} alt={camp.name} fill unoptimized loading="eager" sizes="(max-width: 767px) 100vw, 720px"
              onError={() => setImageFailed(true)} />
          ) : <EddyIcon name="campground" size={64} decorative />}
          <button className={styles.close} autoFocus aria-label="Close campground" onClick={close}><X size={20} aria-hidden /></button>
        </div>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{camp.displayGroup.label}</p>
          <h2 id="campground-title">{camp.name}</h2>
          <p className={styles.dates}>{dateLabel(arrival)} – {dateLabel(departure)} <span>· {nights} {nights === 1 ? 'night' : 'nights'}</span></p>
          <div className={styles.actions}>
            {camp.accessDestination && <Link className={styles.action} href={`/plan?${new URLSearchParams({ river: camp.accessDestination.riverSlug, access: camp.accessDestination.accessId })}`}>
              <MapPin size={16} aria-hidden /> River map
            </Link>}
            <button className={styles.action} onClick={share}>
              {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
              {copied ? 'Link copied' : 'Share'}
            </button>
            <span className="sr-only" role="status">{copied ? 'Campground link copied' : ''}</span>
          </div>
          {shareError && <p role="alert" className={styles.note}>Copy the page address to share this campground.</p>}
        </div>
      </header>
      <div className={styles.body}>
        {facilities.map(f => <FacilitySites key={`${f.facilityId}:${arrival}:${departure}`} facility={f} campName={camp.name}
          multiple={facilities.length > 1} arrival={arrival} departure={departure} filters={filters} clock={clock}
          showUnavailable={showUnavailable} setShowUnavailable={setShowUnavailable} />)}
        <p className={styles.footnote}>Availability is for {nights === 1 ? 'your selected night' : `all ${nights} nights`}. Confirm details with the booking provider.</p>
      </div>
    </>
  );
}

function FacilitySites({ facility: f, campName, multiple, arrival, departure, filters, clock, showUnavailable, setShowUnavailable }: {
  facility: TrackedCampground; campName: string; multiple: boolean; arrival: string; departure: string;
  filters: WebSiteFilter[]; clock: number; showUnavailable: boolean; setShowUnavailable: (value: boolean) => void;
}) {
  const [data, setData] = useState<CampingStayResult | null>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  // Each section paints independently. The clock also expires the short cache
  // while a dialog stays open; stale observations never retain green pills.
  useEffect(() => {
    let active = true;
    setError(false);
    loadCampgroundSites(f.facilityId, arrival, departure).then(result => {
      if (active) setData(result);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [f.facilityId, arrival, departure, clock, retry]);
  const answer = data ? filteredStay([compactStay(data, f.source)], filters, clock) : null;
  const age = data?.fetchedAt ? clock - Date.parse(data.fetchedAt) : Infinity;
  const fresh = Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
  const entries = (data?.sites ?? []).map(s => currentPolicyStay(s, fresh, clock));
  const matches = entries.filter(s => !filters.length || filters.some(filter => siteFlags(s.site, f.source)[filter] === true));
  const unavailable = matches.some(s => s.state === 'unavailable');
  const sites = matches.filter(s => s.state === 'available' || s.state === 'first_come' || (showUnavailable && s.state === 'unavailable'));
  const hours = Math.max(0, Math.floor(age / 3_600_000));
  const checked = Number.isFinite(age) ? `Checked ${hours < 1 ? '<1h' : `${hours}h`} ago` : 'No recent check';
  return (
    <section className={styles.section} aria-label={multiple ? f.loopName ?? f.name : 'Campsites'}>
      {multiple && <h3>{f.loopName ?? f.name}</h3>}
      {error && data !== undefined && <p role="status" className={styles.refreshNotice}>Couldn’t refresh. <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
      {error && data === undefined ? <p role="alert" className={styles.notice}>Couldn’t load sites. <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>
        : data === undefined ? <div className={styles.loading} role="status"><span>Checking sites…</span><div /><div /></div>
          : <>
            <div className={styles.summary}>
              <strong>{answer?.state === 'available'
                ? `${answer.partial ? 'At least ' : ''}${answer.count} ${answer.count === 1 ? 'site' : 'sites'} available`
                : answer ? stayLabel(answer) : 'Site details unavailable'}</strong>
              <span>{checked}</span>
            </div>
            {unavailable && <label className={styles.toggle}><input type="checkbox" checked={showUnavailable}
              onChange={event => setShowUnavailable(event.target.checked)} /> Show unavailable sites</label>}
            <div className={styles.siteList}>
              {sites.map(entry => {
                const name = siteName(entry.site.name, campName);
                const loop = entry.site.loop && ![campName, f.name, f.loopName].includes(entry.site.loop) ? entry.site.loop : null;
                return <article className={styles.site} key={entry.site.id} aria-label={name}>
                  <SitePhotos facility={f.facilityId} site={entry.site.id} name={name} />
                  <div className={styles.siteBody}>
                    <div className={styles.siteHeading}><h4>{name}</h4>
                      <span className={styles.pill} data-state={entry.state} title={campingStayLabel(entry)}>{statusLabel(entry)}</span>
                    </div>
                    <p className={styles.meta}>{[loop, siteType(entry.site.siteType)].filter(Boolean).join(' · ')}</p>
                    {Boolean(entry.site.maxOccupancy) && <p className={styles.occupancy}><Users size={13} aria-hidden /> Up to {entry.site.maxOccupancy}</p>}
                    {campingPolicyNote(entry, clock) && <p className={styles.note}>{campingPolicyNote(entry, clock)}</p>}
                    {entry.site.policy && entry.nights.some(n => n.observedState !== undefined && n.observedState !== n.state) && <a className={styles.rules} href={entry.site.policy.sourceUrl} target="_blank" rel="noopener noreferrer">Park’s camping rules ↗</a>}
                    {entry.site.bookingUrl && entry.state === 'available' && <a className={styles.siteLink}
                      href={entry.site.bookingUrl} target="_blank" rel="noopener noreferrer" data-ga-event="camping_provider_click"
                      aria-label={`View ${name} on ${f.source === 'mo_state_parks' ? 'Missouri State Parks' : 'Recreation.gov'}`}>
                      View site <ExternalLink size={13} aria-hidden />
                    </a>}
                  </div>
                </article>;
              })}
            </div>
          </>}
      {f.booking && <a className={styles.provider} href={f.booking.url} target="_blank" rel="noopener noreferrer" data-ga-event="camping_provider_click">
        {f.loopName ? 'Check district permit' : f.source === 'mo_state_parks' ? 'Missouri State Parks' : 'Recreation.gov'} <ExternalLink size={15} aria-hidden />
      </a>}
    </section>
  );
}
