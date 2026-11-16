import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { damPhoto, lakeDamPhoto, lakePhoto } from '@/lib/lakes/photography';

/** Shared place identity; the following .place-content overlaps its lower edge. */
export default function PlaceHeader({ lakeSlug = '', damId, kind = 'dam', title, children, actions }: {
  lakeSlug?: string;
  damId?: string;
  kind?: 'dam' | 'lake';
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const photo = kind === 'lake' ? lakePhoto(lakeSlug) : damPhoto(damId) ?? lakeDamPhoto(lakeSlug);
  return (
    <header className={`place-header ${photo ? '' : 'place-header--illustrated'}`} data-place-kind={kind}>
      {photo ? <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1280px) 1216px, 100vw" preload className="object-cover" style={photo.focus ? { objectPosition: photo.focus } : undefined} /> : <div className="place-header-art" aria-hidden="true"><EddyIcon name={kind === 'lake' ? 'boatRamp' : 'dam'} size={140} /></div>}
      <div className="place-header-shade" />
      <div className="place-header-copy">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/90 sm:text-sm">
          <Link href="/rivers" className="inline-flex min-h-11 items-center hover:underline">Conditions</Link>
          <span aria-hidden="true">/</span>
          {kind === 'dam' ? <Link href="/dams" className="inline-flex min-h-11 items-center hover:underline">Dams</Link> : <span>Lakes</span>}
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
            <div className="mt-2 text-sm text-white/90">{children}</div>
          </div>
          {actions && <div className="place-header-actions shrink-0">{actions}</div>}
        </div>
      </div>
    </header>
  );
}
