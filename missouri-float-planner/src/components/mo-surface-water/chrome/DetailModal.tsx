'use client';

import { useEffect, useState } from 'react';
import {
  THEME,
  type MORiver,
  type MOCampground,
  type MOAccessPoint,
  type MOPoi,
} from '@/lib/usgs/mo-statewide-data';
import { MONO } from './shared';

export type ModalSelection =
  | { kind: 'access'; ap: MOAccessPoint; river: MORiver }
  | { kind: 'campground'; camp: MOCampground; nearestRiverName: string | null }
  | { kind: 'poi'; poi: MOPoi; river: MORiver };

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(15,45,53,0.55)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(560px,92vw)] max-h-[80vh] overflow-y-auto rounded-md border-2"
        style={{
          background: THEME.cardBg,
          borderColor: THEME.cardBorder,
          color: THEME.ink,
          boxShadow: `5px 5px 0 ${THEME.cardShadow}`,
          fontFamily: 'var(--font-body), system-ui, sans-serif',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 grid place-items-center w-8 h-8 rounded-md border-2"
          style={{ background: 'var(--color-surface)', borderColor: THEME.cardBorder, fontSize: 16, lineHeight: 1, fontWeight: 700, color: THEME.ink }}
        >×</button>
        <div className="p-5 pr-12">
          <div
            className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--color-accent-700)', marginBottom: 4 }}
          >
            {subtitle ?? '—'}
          </div>
          <h2 className="font-bold" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 12 }}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

function LinkRow({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border-2 hover:bg-secondary-100 transition-colors"
      style={{
        borderColor: THEME.cardBorder,
        background: 'var(--color-secondary-50)',
        fontFamily: MONO,
        fontSize: 12,
        color: THEME.ink,
      }}
    >
      <span className="flex flex-col">
        <span style={{ fontWeight: 700 }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: THEME.inkDim, letterSpacing: '0.05em' }}>{hint}</span>}
      </span>
      <span aria-hidden style={{ fontSize: 14, color: THEME.inkDim }}>↗</span>
    </a>
  );
}

// Compact photo strip for the access-point modal. Pulls from
// access_points.image_urls (00022) — surfaced via the dataset RPC by
// 00123. Renders the first image as a hero with a horizontally
// scrollable thumbnail row when more are available; nothing renders if
// the row has no photos.
function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (!urls.length) return null;
  const active = urls[Math.min(activeIdx, urls.length - 1)];
  return (
    <div className="mb-4 -mx-1">
      <div
        className="rounded-md overflow-hidden border-2"
        style={{ borderColor: THEME.cardBorder, background: '#0F2D35', aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active}
          alt={alt}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      {urls.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 px-1">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Photo ${i + 1} of ${urls.length}`}
              className="flex-shrink-0 rounded-sm overflow-hidden border-2"
              style={{
                width: 60, height: 40,
                borderColor: i === activeIdx ? THEME.primary : THEME.cardBorder,
                opacity: i === activeIdx ? 1 : 0.7,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: THEME.inkDim, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: THEME.ink, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function DetailModal({
  selection,
  onClose,
}: {
  selection: ModalSelection | null;
  onClose: () => void;
}) {
  if (!selection) return null;

  if (selection.kind === 'access') {
    const { ap, river } = selection;
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${ap.lat},${ap.lon}`;
    const images = ap.image_urls ?? [];
    return (
      <ModalShell title={ap.name} subtitle={`Access · ${river.name}`} onClose={onClose}>
        <ImageGallery urls={images} alt={ap.name} />
        <div className="space-y-1 mb-4">
          <FactRow label="Type" value={ap.type.replace(/_/g, ' ')} />
          {ap.river_mile_downstream != null && (
            <FactRow label="River mile" value={`${ap.river_mile_downstream.toFixed(1)} mi from headwaters`} />
          )}
          {ap.ownership && <FactRow label="Ownership" value={ap.ownership} />}
          <FactRow label="Coordinates" value={`${ap.lat.toFixed(4)}, ${ap.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          <LinkRow href={`/rivers/${river.slug}/access`} label="Open in Eddy float planner" hint={`All access on the ${river.name}`} />
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  if (selection.kind === 'campground') {
    const { camp, nearestRiverName } = selection;
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${camp.lat},${camp.lon}`;
    return (
      <ModalShell
        title={camp.name}
        subtitle={nearestRiverName ? `Campground · near ${nearestRiverName}` : 'Campground'}
        onClose={onClose}
      >
        <div className="space-y-1 mb-4">
          {camp.total_sites != null && <FactRow label="Total sites" value={camp.total_sites} />}
          {camp.sites_reservable != null && <FactRow label="Reservable" value={camp.sites_reservable} />}
          {camp.sites_first_come != null && <FactRow label="First come" value={camp.sites_first_come} />}
          <FactRow label="Coordinates" value={`${camp.lat.toFixed(4)}, ${camp.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          {camp.reservation_url && (
            <LinkRow href={camp.reservation_url} label="Reserve a site" hint="Recreation.gov" />
          )}
          {camp.nps_url && (
            <LinkRow href={camp.nps_url} label="View on NPS.gov" hint="Park information" />
          )}
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  if (selection.kind === 'poi') {
    const { poi, river } = selection;
    const typeLabel = poi.type.replace(/_/g, ' ');
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`;
    return (
      <ModalShell title={poi.name} subtitle={`${typeLabel} · ${river.name}`} onClose={onClose}>
        {poi.description && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: THEME.ink, marginBottom: 12 }}>
            {poi.description}
          </p>
        )}
        <div className="space-y-1 mb-4">
          <FactRow label="Type" value={typeLabel} />
          {poi.river_mile != null && (
            <FactRow label="River mile" value={`${poi.river_mile.toFixed(1)} mi`} />
          )}
          <FactRow label="Coordinates" value={`${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`} />
        </div>
        <div className="grid gap-2">
          {poi.nps_url && <LinkRow href={poi.nps_url} label="View on NPS.gov" hint="Park information" />}
          <LinkRow href={`/rivers/${river.slug}`} label={`Open ${river.name} in Eddy`} hint="River overview + access points" />
          <LinkRow href={mapsHref} label="Open in Google Maps" hint="Driving directions" />
        </div>
      </ModalShell>
    );
  }

  return null;
}

// ─── Hover overlay ──────────────────────────────────────────────────────
//
// Small floating card pinned to the hovered gauge. When Eddy has a report
// for the gauge it shows the avatar + verdict badge + summary + source line;
// otherwise it falls back to a compact live-reading card (verdict + flow/
// stage) so every gauge gives feedback on hover. This is the single hover
// affordance — the right rail only opens on click (GaugeDetail).

