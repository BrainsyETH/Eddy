'use client';
import { useEffect, useId, useState } from 'react';
import Image from 'next/image';
import type { CampsitePhoto } from '@/lib/camping/photos';
import styles from './CampingHub.module.css';

/** Explicitly requested, exact-site photos. They never block availability. */
export default function SitePhotos({
  facility,
  site,
  name,
}: {
  facility: string;
  site: string;
  name: string;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<CampsitePhoto[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!expanded || photos !== null) return;
    const controller = new AbortController();
    setError(false);
    fetch(`/api/campsites/photos?${new URLSearchParams({ facility, site })}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Photos unavailable');
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setPhotos(data.photos?.[site] ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [expanded, facility, site, photos]);
  return (
    <div className={styles.photos}>
      <button
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide site photos' : 'Site photos'}
      </button>
      {expanded && (
        <div id={id}>
          {error ? (
            <p>
              Photos are temporarily unavailable. Close and reopen to retry.
            </p>
          ) : photos === null ? (
            <p role="status">Loading site photos…</p>
          ) : !photos.length ? (
            <p>No photos available for this site.</p>
          ) : (
            <div className={styles.photoStrip}>
              {photos.map((photo) => (
                <figure key={photo.url}>
                  <Image
                    src={photo.url}
                    alt={photo.title || name}
                    width={600}
                    height={400}
                    unoptimized
                    loading="lazy"
                  />
                  <figcaption>
                    {[photo.title, photo.credit, photo.source]
                      .filter(Boolean)
                      .join(' · ')}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
