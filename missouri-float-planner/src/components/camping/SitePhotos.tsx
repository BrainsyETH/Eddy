'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, X } from 'lucide-react';
import type { CampsitePhoto } from '@/lib/camping/photos';
import { withCampingTimeout } from '@/lib/camping/web-request';
import styles from './CampgroundDetails.module.css';

// Optional media cannot occupy every connection while availability is loading.
let active = 0;
const waiting: (() => void)[] = [];
function queuePhoto<T>(load: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const start = () => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) { cancel(); return; }
      active++;
      void load().then(resolve, reject).finally(() => {
        active--;
        while (active < 3 && waiting.length) waiting.shift()!();
      });
    };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    waiting.push(start);
    while (active < 3 && waiting.length) waiting.shift()!();
  });
}
const cache = new Map<string, { until: number; photos: CampsitePhoto[] }>();

/** Load exact-site media as each row approaches the dialog's visible area. */
export default function SitePhotos({ facility, site, name }: { facility: string; site: string; name: string }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<CampsitePhoto[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!root.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '180px' });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const key = `${facility}:${site}`;
    const now = Date.now();
    for (const [key, value] of cache) if (value.until <= now) cache.delete(key);
    const saved = cache.get(key);
    if (saved) { setPhotos(saved.photos); return; }
    setError(false);
    void queuePhoto(() => withCampingTimeout(async signal => {
      // Version the URL to bypass older cached empty media responses, as on iOS.
      const response = await fetch(`/api/campsites/photos?${new URLSearchParams({ media: '2', facility, site })}`, {
        signal,
      });
      if (!response.ok) throw new Error('Photos unavailable');
      const data = await response.json();
      return (data.photos?.[site] ?? []) as CampsitePhoto[];
    }, 10000, controller.signal), controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 3_600_000, photos: result });
      setPhotos(result);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [visible, facility, site, retry]);
  const usable = photos?.filter(photo => !failed.includes(photo.url));
  const first = usable?.[0];
  const markFailed = (url: string) => setFailed(previous => [...previous, url]);
  return <>
    <div className={styles.photo} ref={root}>
      {first ? <>
        <button ref={trigger} className={styles.thumbnail} aria-label={`View photos of ${name}`} aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded(value => !value)}>
          <Image src={first.url} alt={first.title || name} width={300} height={225} unoptimized loading="lazy" onError={() => markFailed(first.url)} />
          <span className={styles.photoCount}><Camera size={12} aria-hidden /> {usable?.length}</span>
        </button>
        <p className={styles.photoCaption}>{[first.credit, first.source].filter(Boolean).join(' · ')}</p>
      </> : error ? <button className={styles.thumbnail} onClick={() => setRetry(value => value + 1)} aria-label={`Retry photos of ${name}`}>
        <span className={styles.photoPlaceholder}><Camera size={22} aria-hidden /> Retry photos</span>
      </button> : <div className={styles.thumbnail}>
        <span className={styles.photoPlaceholder}><Camera size={22} aria-hidden />{photos === null ? 'Loading photo…' : 'No site photo'}</span>
      </div>}
    </div>
    {expanded && first && <div id={id} className={styles.gallery}>
      <button onClick={() => { setExpanded(false); trigger.current?.focus(); }}><X size={14} aria-hidden /> Close photos</button>
      <div className={styles.galleryStrip} tabIndex={0} role="region" aria-label={`Photos of ${name}`}>
        {usable?.map(photo => <figure key={photo.url}>
          <Image src={photo.url} alt={photo.title || name} width={600} height={400} unoptimized loading="lazy" onError={() => markFailed(photo.url)} />
          <figcaption className={styles.photoCaption}>{[photo.title, photo.credit, photo.source].filter(Boolean).join(' · ')}</figcaption>
        </figure>)}
      </div>
    </div>}
  </>;
}
