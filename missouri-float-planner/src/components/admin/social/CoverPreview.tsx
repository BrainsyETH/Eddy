'use client';

import { useEffect, useRef, useState } from 'react';

/** Crop the actual asset rather than drawing a guide over a different video. */
export function CoverPreview({ src, platform, videoUrl, directPost = false }: {
  src: string | null; platform: string; videoUrl: string | null; directPost?: boolean;
}) {
  const [crop, setCrop] = useState('3 / 4');
  const [frame, setFrame] = useState(0.5);
  const video = useRef<HTMLVideoElement>(null);
  const customCover = platform === 'instagram' || !videoUrl;
  useEffect(() => { if (video.current) video.current.currentTime = frame; }, [frame, videoUrl]);
  return <div>
    <h4 className="text-sm font-medium text-white">{customCover ? 'Cover crop preview' : 'Video thumbnail preview'}</h4>
    <p className="mt-1 text-xs text-neutral-400">{customCover
      ? 'This is the actual image asset. Crop examples are centered; the live placement can vary.'
      : platform === 'tiktok' && directPost
        ? 'Direct posting requests the frame at 0.5 seconds. Other frame previews here do not change that setting.'
        : platform === 'tiktok'
          ? 'Choose the final cover in TikTok when finishing the inbox draft. The stored artwork is not sent as its cover.'
          : 'Facebook selects the thumbnail. This publisher does not upload the stored artwork as a video cover.'}</p>
    <label className="block my-3 text-sm text-neutral-300">Preview crop <select className="bg-neutral-700 rounded p-1" value={crop} onChange={e => setCrop(e.target.value)}>
      <option value="9 / 16">9:16</option><option value="3 / 4">3:4</option><option value="4 / 5">4:5</option><option value="1 / 1">Square</option>
    </select></label>
    <div className="relative overflow-hidden rounded bg-black w-full" style={{ aspectRatio: crop }}>
      {customCover && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Actual cover in the selected centered crop" className="absolute inset-0 w-full h-full object-cover" />
      ) : videoUrl ? <video ref={video} src={videoUrl} muted playsInline preload="auto" onLoadedMetadata={() => { if (video.current) video.current.currentTime = frame; }} className="absolute inset-0 w-full h-full object-cover" /> : <p className="p-3 text-neutral-400">Cover unavailable</p>}
    </div>
    {!customCover && videoUrl && <label className="block mt-3 text-sm text-neutral-300">Inspect frame (seconds) <input type="number" min="0" step="0.1" value={frame} onChange={e => setFrame(Math.min(Number.isFinite(video.current?.duration) ? video.current!.duration : Infinity, Math.max(0, Number(e.target.value) || 0)))} className="w-20 rounded bg-neutral-700 p-1" /></label>}
    {!customCover && src && <details className="mt-3 text-xs text-neutral-400"><summary>Stored artwork — not the published thumbnail</summary>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Reference artwork only" className="mt-2 w-full" />
    </details>}
  </div>;
}
