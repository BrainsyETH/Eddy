'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import {
  chartImagePath,
  chartSharePath,
  chartShareTitle,
  type ChartShareState,
} from '@shared/chart-share';

/** Touch devices get the system share sheet; desktop browsers copy, matching the page's other Share buttons. */
function prefersShareSheet(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Freeze the selected view before rendering; the preview and attachment use the same bytes. */
export default function ChartShareControls({
  state,
  stationName,
}: {
  state: ChartShareState | null;
  stationName?: string | null;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    file: File;
    title: string;
    link: string;
  } | null>(null);
  const inFlight = useRef(false);
  const sharing = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function shareLink() {
    if (!state || sharing.current) return;
    sharing.current = true;
    setMessage('');
    try {
      const url = new URL(chartSharePath(state), window.location.origin).href;
      if (prefersShareSheet() && navigator.share)
        await navigator.share({ title: chartShareTitle(stationName, state), url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Chart link copied.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setMessage('Could not share the link. Please try again.');
    } finally {
      sharing.current = false;
    }
  }
  async function prepareImage() {
    if (!state || inFlight.current) return;
    const snapshot = structuredClone(state);
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setPreview(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(chartImagePath(snapshot), { signal: controller.signal });
      if (response.status === 422)
        throw new Error(
          'This saved view is no longer available. Open the gauge for current conditions.',
        );
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png'))
        throw new Error('Image unavailable');
      const blob = await response.blob();
      const file = new File([blob], `eddy-${snapshot.siteId}-chart.png`, { type: 'image/png' });
      setPreview({
        url: URL.createObjectURL(blob),
        file,
        title: chartShareTitle(stationName, snapshot),
        link: new URL(chartSharePath(snapshot), window.location.origin).href,
      });
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith('This saved view')
          ? error.message
          : 'Could not prepare the image. Please try again.',
      );
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setBusy(false);
      request.current = null;
    }
  }
  function downloadImage() {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.file.name;
    a.click();
    setMessage('Image downloaded.');
  }
  async function shareImage() {
    if (!preview || sharing.current) return;
    sharing.current = true;
    try {
      // The link travels with the picture so a recipient can open the live view.
      const data = { files: [preview.file], title: preview.title, text: `${preview.title}\n${preview.link}` };
      if (prefersShareSheet() && navigator.canShare?.(data)) await navigator.share(data);
      else if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': preview.file })]);
        setMessage('Image copied. Paste it anywhere.');
      } else downloadImage();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setMessage('Could not share the image. Please try again.');
    } finally {
      sharing.current = false;
    }
  }
  return (
    <div className="px-5 py-3 text-xs text-neutral-600">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!state} onClick={shareLink}>
          Share chart link
        </Button>
        <Button size="sm" variant="outline" disabled={!state || busy} onClick={prepareImage}>
          {busy ? 'Preparing image…' : 'Preview share image'}
        </Button>
      </div>
      <p className="mt-2">Links preserve this chart view. Source readings may be revised.</p>
      <p role="status">{message}</p>
      {preview && (
        <div className="mt-3 rounded-lg border border-neutral-200 p-3">
          <Image
            src={preview.url}
            alt="Preview of the chart image to share"
            width={1200}
            height={630}
            unoptimized
            className="h-auto w-full"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={shareImage}>
              Share or copy this image
            </Button>
            <Button size="sm" variant="outline" onClick={downloadImage}>
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
              Close preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
