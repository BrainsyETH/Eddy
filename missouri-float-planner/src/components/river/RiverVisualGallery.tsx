'use client';

// src/components/river/RiverVisualGallery.tsx
// Displays community-submitted river photos matching current conditions

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Camera, ChevronLeft, ChevronRight, X, MapPin, Droplets, Ruler } from 'lucide-react';
import { CONDITION_SHORT_LABELS } from '@/constants';
import type { RiverVisual, RiverVisualsResponse } from '@/types/api';

interface RiverVisualGalleryProps {
  riverSlug: string;
  accessPointId?: string | null;
}

export default function RiverVisualGallery({ riverSlug, accessPointId }: RiverVisualGalleryProps) {
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

  // Don't render if no visuals or still loading
  if (loading) return null;
  if (!data || data.visuals.length === 0) return null;

  const visuals = data.visuals;
  const current = visuals[currentIndex];
  const conditionLabel = CONDITION_SHORT_LABELS[data.currentCondition] || data.currentCondition;

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-neutral-500" />
            <h3 className="text-sm font-semibold text-neutral-800">
              River Visuals
            </h3>
            <span className="text-xs text-neutral-400">
              at {conditionLabel} conditions
            </span>
          </div>
          <span className="text-xs text-neutral-400">
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
        <div className="px-4 py-3 space-y-1">
          {current.description && (
            <p className="text-sm text-neutral-700 line-clamp-2">{current.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            {current.accessPointName && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {current.accessPointName}
              </span>
            )}
            {current.gaugeHeightFt != null && (
              <span className="flex items-center gap-1">
                <Ruler className="w-3 h-3" />
                {current.gaugeHeightFt} ft
              </span>
            )}
            {current.dischargeCfs != null && (
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3" />
                {current.dischargeCfs} cfs
              </span>
            )}
            {current.submitterName && (
              <span>by {current.submitterName}</span>
            )}
          </div>
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
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => onNavigate(currentIndex < visuals.length - 1 ? currentIndex + 1 : 0)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
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
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {current.accessPointName}
              </span>
            )}
            {current.gaugeHeightFt != null && <span>{current.gaugeHeightFt} ft</span>}
            {current.dischargeCfs != null && <span>{current.dischargeCfs} cfs</span>}
            {current.submitterName && <span>by {current.submitterName}</span>}
            <span>{currentIndex + 1} / {visuals.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
