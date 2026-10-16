'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import { chartImagePath, chartSharePath, type ChartShareState } from '@shared/chart-share';

/** Freeze the selected view before rendering; the preview and attachment use the same bytes. */
export default function ChartShareControls({ state }: { state: ChartShareState | null }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function shareLink() {
    if (!state || inFlight.current) return;
    inFlight.current = true;
    setMessage('');
    try {
      const url = new URL(chartSharePath(state), window.location.origin).href;
      if (navigator.share) await navigator.share({ title: 'Eddy chart', url });
      else { await navigator.clipboard.writeText(url); setMessage('Chart link copied.'); }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Could not share the link. Please try again.'); }
    finally { inFlight.current = false; }
  }
  async function prepareImage() {
    if (!state || inFlight.current) return;
    const snapshot = structuredClone(state);
    inFlight.current = true; setBusy(true); setMessage(''); setPreview(null);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(chartImagePath(snapshot), { signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('Image unavailable');
      const blob = await response.blob();
      const file = new File([blob], `eddy-${snapshot.siteId}-chart.png`, { type: 'image/png' });
      setPreview({ url: URL.createObjectURL(blob), file });
    } catch { setMessage('Image unavailable. An internet connection is required. Please try again.'); }
    finally { clearTimeout(timeout); inFlight.current = false; setBusy(false); request.current = null; }
  }
  async function shareImage() {
    if (!preview || inFlight.current) return;
    inFlight.current = true;
    try {
      if (navigator.canShare?.({ files: [preview.file] })) await navigator.share({ files: [preview.file], title: 'Eddy chart' });
      else {
        const a = document.createElement('a'); a.href = preview.url; a.download = preview.file.name; a.click();
        setMessage('Image downloaded.');
      }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Could not share the image. Please try again.'); }
    finally { inFlight.current = false; }
  }
  return <div className="px-5 py-3 text-xs text-neutral-600">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!state || busy} onClick={shareLink}>Share chart link</Button>
      <Button size="sm" variant="outline" disabled={!state || busy} onClick={prepareImage}>{busy ? 'Preparing image…' : 'Preview share image'}</Button>
    </div>
    <p className="mt-2">Links save fixed dates. Images require internet. USGS provisional values may be revised.</p>
    <p role="status">{message}</p>
    {preview && <div className="mt-3 rounded-lg border border-neutral-200 p-3">
      <Image src={preview.url} alt="Preview of the chart image to share" width={1200} height={630} unoptimized className="h-auto w-full" />
      <div className="mt-2 flex gap-2"><Button size="sm" onClick={shareImage}>Share or save this image</Button>
        <Button size="sm" variant="outline" onClick={() => setPreview(null)}>Close preview</Button></div>
    </div>}
  </div>;
}
