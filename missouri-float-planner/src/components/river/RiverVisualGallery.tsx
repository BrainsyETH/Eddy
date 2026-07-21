'use client';

// src/components/river/RiverVisualGallery.tsx
// Displays community-submitted river photos matching current conditions

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, ChevronLeft, ChevronRight, X, MapPin, Droplets, Ruler } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import type { ConditionCode, RiverVisual, RiverVisualsResponse } from '@/types/api';

// Level bands ordered dry → flood, for the scrubber.
const LEVEL_ORDER: ConditionCode[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous', 'unknown'];

interface RiverVisualGalleryProps {
  riverSlug: string;
  accessPointId?: string | null;
  /** When provided, an empty gallery shows a CTA linking to the add-photo page. */
  addPhotoHref?: string;
  /** Fallback empty-state CTA action (opens a modal) when no addPhotoHref is given. */
  onAddPhoto?: () => void;
}

export default function RiverVisualGallery({ riverSlug, accessPointId, addPhotoHref, onAddPhoto }: RiverVisualGalleryProps) {
  const [data, setData] = useState<RiverVisualsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<ConditionCode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVisuals() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (accessPointId) params.set('accessPointId', accessPointId);
        const url = `/api/rivers/${riverSlug}/visuals${params.toString() ? `?${params}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json: RiverVisualsResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setCurrentIndex(0);
          setSelectedLevel(null);
        }
      } catch {
        // Silently fail — gallery is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVisuals();
    return () => { cancelled = true; };
  }, [riverSlug, accessPointId]);

  // Which band's photos are showing. Defaults to the river's current level when
  // it has photos, else the nearest band that does.
  const activeLevel = useMemo<ConditionCode | null>(() => {
    if (!data || data.byLevel.length === 0) return null;
    const has = (c: ConditionCode) => data.byLevel.some((l) => l.code === c);
    if (selectedLevel && has(selectedLevel)) return selectedLevel;
    if (has(data.currentCondition)) return data.currentCondition;
    const i = LEVEL_ORDER.indexOf(data.currentCondition);
    if (i >= 0) {
      return [...data.byLevel].sort(
        (a, b) => Math.abs(LEVEL_ORDER.indexOf(a.code) - i) - Math.abs(LEVEL_ORDER.indexOf(b.code) - i)
      )[0].code;
    }
    return data.byLevel[0].code;
  }, [data, selectedLevel]);

  const activeGroup = data?.byLevel.find((l) => l.code === activeLevel) ?? null;
  const groupVisuals = activeGroup?.visuals ?? [];

  const navigate = useCallback((direction: 1 | -1) => {
    if (!groupVisuals.length) return;
    setCurrentIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return groupVisuals.length - 1;
      if (next >= groupVisuals.length) return 0;
      return next;
    });
  }, [groupVisuals.length]);

  // Don't render while loading or if the fetch failed.
  if (loading || !data) return null;

  // No verified photos at any level yet — invite a contribution in the image's
  // place, when the host gives us a link (or a modal action) to add one.
  if (data.byLevel.length === 0) {
    if (!addPhotoHref && !onAddPhoto) return null;
    const ctaClass = 'group w-full aspect-[16/10] flex flex-col items-center justify-center gap-2 px-6 text-center bg-neutral-50 hover:bg-neutral-100 transition-colors';
    const ctaInner = (
      <>
        <span className="flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors">
          <Camera className="w-6 h-6" />
        </span>
        <span className="text-sm font-semibold text-neutral-800">No photos at this level yet</span>
        <span className="text-xs text-neutral-500 max-w-xs">
          Show fellow floaters what the water looks like right now.
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold group-hover:bg-teal-700 transition-colors">
          <Camera className="w-3.5 h-3.5" /> Add a photo
        </span>
      </>
    );
    return (
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-x-2">
            <Camera className="w-4 h-4 text-neutral-500 shrink-0" />
            <h3 className="text-sm font-semibold text-neutral-800">
              What the river looks like
            </h3>
          </div>
          {data.currentCondition !== 'unknown' && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-600">
              <span className="font-semibold">Right now:</span>
              <ConditionBadge code={data.currentCondition} size="sm" />
            </p>
          )}
        </div>
        {addPhotoHref ? (
          <Link href={addPhotoHref} className={ctaClass}>{ctaInner}</Link>
        ) : (
          <button type="button" onClick={onAddPhoto} className={ctaClass}>{ctaInner}</button>
        )}
      </div>
    );
  }

  const visuals = groupVisuals;
  const current = visuals[currentIndex] ?? visuals[0];
  // Do we actually have a photo AT the river's current level? Drives whether the
  // "Right now" status notes that no photo matches yet.
  const hasCurrentLevelPhotos = data.byLevel.some((l) => l.code === data.currentCondition);

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Header: title + the ONE live-condition status. The photo's own level
            lives on the "Photos at" scrubber below and is not repeated here —
            three identical-looking condition pills read as one confused status. */}
        <div className="px-4 py-3 border-b border-neutral-100">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Camera className="w-4 h-4 text-neutral-500 shrink-0" />
            <h3 className="text-sm font-semibold text-neutral-800">
              What the river looks like
            </h3>
            <span className="ml-auto text-xs text-neutral-400 whitespace-nowrap">
              {visuals.length} photo{visuals.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Live condition — the river's status right now. Distinct from the
              per-photo levels below so the two never get conflated. */}
          {data.currentCondition !== 'unknown' && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-600">
              <span className="font-semibold">Right now:</span>
              <ConditionBadge code={data.currentCondition} size="sm" />
              {!hasCurrentLevelPhotos && (
                <span className="text-neutral-400">· no community photos at this level yet</span>
              )}
            </p>
          )}
        </div>

        {/* Photos-by-level browser — a distinct control from the live status
            above. Labeled so its condition pills read as "which level's photos"
            rather than another live-status claim. The current level, when we have
            a photo for it, is marked "now". */}
        <div className="px-4 pt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-xs font-medium text-neutral-500">
            {data.byLevel.length > 1 ? 'Photos at:' : 'Level:'}
          </span>
          {data.byLevel.map((l) => {
            const isActive = l.code === activeLevel;
            const isNow = l.code === data.currentCondition;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => { setSelectedLevel(l.code); setCurrentIndex(0); }}
                aria-pressed={isActive}
                title={isNow ? 'The river is at this level right now' : `See the river at ${l.code}`}
                className="inline-flex items-center gap-1"
              >
                {/* inline-flex so this wrapper shrink-wraps the pill: a plain
                    inline span is sized by font metrics, so the active ring
                    painted on it sat misaligned around the taller badge. */}
                <span className={`inline-flex rounded-full transition ${isActive ? 'ring-2 ring-teal-500 ring-offset-1' : 'opacity-50 hover:opacity-100'}`}>
                  <ConditionBadge code={l.code} size="sm" />
                </span>
                {isNow && <span className="text-[10px] font-semibold text-teal-600">now</span>}
              </button>
            );
          })}
        </div>

        {/* Image carousel */}
        <div className="relative aspect-[16/10] bg-neutral-100">
          <Image
            src={current.imageUrl}
            alt={current.description || 'River visual'}
            fill
            className="object-cover cursor-pointer"
            sizes="(max-width: 768px) 100vw, 600px"
            onClick={() => setLightboxOpen(true)}
          />

          {/* Navigation arrows */}
          {visuals.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {visuals.length > 1 && visuals.length <= 10 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {visuals.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                  aria-label={`Go to photo ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Caption / metadata */}
        <div className="px-4 py-3 space-y-2.5">
          {current.description && (
            <p className="text-sm text-neutral-700 line-clamp-2">{current.description}</p>
          )}
          {/* Stage + flow when the photo was taken — the whole point of the gallery */}
          {(current.gaugeHeightFt != null || current.dischargeCfs != null) && (
            <div className="flex flex-wrap gap-2">
              {current.gaugeHeightFt != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5">
                  <Ruler className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Stage</span>
                  <span className="text-sm font-bold text-neutral-800">{current.gaugeHeightFt}</span>
                  <span className="text-xs text-neutral-500">ft</span>
                </span>
              )}
              {current.dischargeCfs != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5">
                  <Droplets className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Flow</span>
                  <span className="text-sm font-bold text-neutral-800">{current.dischargeCfs}</span>
                  <span className="text-xs text-neutral-500">cfs</span>
                </span>
              )}
            </div>
          )}
          {/* Which gauge the stage/flow came from — names the reading's source. */}
          {current.gaugeName && (current.gaugeHeightFt != null || current.dischargeCfs != null) && (
            <p className="text-xs text-neutral-400">
              Reading from the {shortenGaugeName(current.gaugeName)} gauge
            </p>
          )}
          {/* Where the shot was taken + who shared it */}
          {(current.accessPointName || current.submitterName) && (
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              {current.accessPointName && (
                current.accessPointHref ? (
                  <Link
                    href={current.accessPointHref}
                    className="flex items-center gap-1 hover:text-teal-600 transition-colors"
                  >
                    <MapPin className="w-3 h-3" />
                    {current.accessPointName}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {current.accessPointName}
                  </span>
                )
              )}
              {current.submitterName && (
                <span>by {current.submitterName}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          visuals={visuals}
          currentIndex={currentIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={(i) => setCurrentIndex(i)}
        />
      )}
    </>
  );
}

function Lightbox({
  visuals,
  currentIndex,
  onClose,
  onNavigate,
}: {
  visuals: RiverVisual[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const current = visuals[currentIndex];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(currentIndex > 0 ? currentIndex - 1 : visuals.length - 1);
      if (e.key === 'ArrowRight') onNavigate(currentIndex < visuals.length - 1 ? currentIndex + 1 : 0);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, visuals.length, onClose, onNavigate]);

  // Lock background scroll while the lightbox is open (restore on unmount).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 z-10"
        aria-label="Close lightbox"
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="relative max-w-5xl max-h-[90vh] w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={current.imageUrl}
          alt={current.description || 'River visual'}
          width={1200}
          height={800}
          className="object-contain max-h-[80vh] w-full"
        />

        {visuals.length > 1 && (
          <>
            <button
              onClick={() => onNavigate(currentIndex > 0 ? currentIndex - 1 : visuals.length - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => onNavigate(currentIndex < visuals.length - 1 ? currentIndex + 1 : 0)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              aria-label="Next photo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Caption below image */}
        <div className="text-center mt-3 space-y-1">
          {current.description && (
            <p className="text-white text-sm">{current.description}</p>
          )}
          <div className="flex items-center justify-center gap-3 text-xs text-white/60">
            {current.accessPointName && (
              current.accessPointHref ? (
                <Link href={current.accessPointHref} className="flex items-center gap-1 hover:text-white transition-colors">
                  <MapPin className="w-3 h-3" /> {current.accessPointName}
                </Link>
              ) : (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {current.accessPointName}
                </span>
              )
            )}
            {current.gaugeHeightFt != null && <span className="font-semibold text-white">{current.gaugeHeightFt} ft</span>}
            {current.dischargeCfs != null && <span className="font-semibold text-white">{current.dischargeCfs} cfs</span>}
            {current.gaugeName && (current.gaugeHeightFt != null || current.dischargeCfs != null) && (
              <span>{shortenGaugeName(current.gaugeName)} gauge</span>
            )}
            {current.submitterName && <span>by {current.submitterName}</span>}
            <span>{currentIndex + 1} / {visuals.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
