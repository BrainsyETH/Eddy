'use client';

// src/components/river/RiverVisualGallery.tsx
// Displays community-submitted river photos matching current conditions

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, ChevronLeft, ChevronRight, X, MapPin, Droplets, Ruler } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import type { RiverVisual, RiverVisualsResponse } from '@/types/api';

interface RiverVisualGalleryProps {
  riverSlug: string;
  accessPointId?: string | null;
  /** When provided, an empty gallery shows a CTA that opens the submit form. */
  onAddPhoto?: () => void;
}

export default function RiverVisualGallery({ riverSlug, accessPointId, onAddPhoto }: RiverVisualGalleryProps) {
  const [data, setData] = useState<RiverVisualsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const navigate = useCallback((direction: 1 | -1) => {
    if (!data?.visuals.length) return;
    setCurrentIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return data.visuals.length - 1;
      if (next >= data.visuals.length) return 0;
      return next;
    });
  }, [data?.visuals.length]);

  // Don't render while loading or if the fetch failed.
  if (loading || !data) return null;

  // No photo matches the current level yet — invite a contribution in the
  // image's place, when the host gives us a way to open the submit form.
  if (data.visuals.length === 0) {
    if (!onAddPhoto) return null;
    return (
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Camera className="w-4 h-4 text-neutral-500 shrink-0" />
          <h3 className="text-sm font-semibold text-neutral-800">
            What the river looks like at this level
          </h3>
          <ConditionBadge code={data.currentCondition} size="sm" />
        </div>
        <button
          type="button"
          onClick={onAddPhoto}
          className="group w-full aspect-[16/10] flex flex-col items-center justify-center gap-2 px-6 text-center bg-neutral-50 hover:bg-neutral-100 transition-colors"
        >
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
        </button>
      </div>
    );
  }

  const visuals = data.visuals;
  const current = visuals[currentIndex];

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Camera className="w-4 h-4 text-neutral-500 shrink-0" />
          <h3 className="text-sm font-semibold text-neutral-800">
            What the river looks like at this level
          </h3>
          <ConditionBadge code={data.currentCondition} size="sm" />
          <span className="ml-auto text-xs text-neutral-400 whitespace-nowrap">
            {visuals.length} photo{visuals.length !== 1 ? 's' : ''}
          </span>
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
            {current.submitterName && <span>by {current.submitterName}</span>}
            <span>{currentIndex + 1} / {visuals.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
