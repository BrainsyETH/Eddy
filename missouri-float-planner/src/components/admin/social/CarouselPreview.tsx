'use client';
import { useState } from 'react';

export default function CarouselPreview({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  return (
    <section aria-label="Daily Report carousel" className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm text-neutral-200">
        <button type="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="min-h-11 rounded border border-neutral-600 px-3 py-2 disabled:opacity-40">Previous</button>
        <span aria-live="polite">Slide {index + 1} of {urls.length}{index === 0 ? ' · Cover' : ''}</span>
        <button type="button" disabled={index === urls.length - 1} onClick={() => setIndex(i => i + 1)} className="min-h-11 rounded border border-neutral-600 px-3 py-2 disabled:opacity-40">Next</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[index]} alt={`Daily Report slide ${index + 1}`} width={1080} height={1350} className="w-full rounded-lg" />
      <a href={urls[index]} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-primary-300 underline">Open full-size slide</a>
    </section>
  );
}
