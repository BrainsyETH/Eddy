'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import ControlPopover from '@/components/ui/ControlPopover';
import { Copy, Download, ImageIcon } from 'lucide-react';
import {
  chartImagePath,
  chartSharePath,
  chartShareTitle,
  type ChartShareState,
} from '@shared/chart-share';

/** Image sharing uses the system sheet on touch devices; links explicitly copy. */
function prefersShareSheet(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Freeze the selected view before rendering; the preview and attachment use the same bytes. */
export default function ChartShareControls({
  state,
  stationName,
  exportCsv,
  canExport,
  allowImages,
  children,
}: {
  state: ChartShareState | null;
  stationName?: string | null;
  exportCsv: () => void;
  canExport: boolean;
  allowImages: boolean;
  children: ReactNode;
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
      await navigator.clipboard.writeText(url);
      setMessage('Chart link copied.');
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
    <div className="border-t border-neutral-200 px-5 py-2 text-xs text-neutral-600">
      <div className="flex items-start justify-between gap-3">
        {children}
        <ControlPopover label="Share">
          {(close) => <div className="grid gap-1">
            {allowImages && <>
              <Button variant="ghost" className="min-h-11 !justify-start !text-sm" disabled={!state} onClick={() => { void shareLink(); close(); }}>
                <Copy className="h-4 w-4" aria-hidden="true" />Copy chart link
              </Button>
              <Button variant="ghost" className="min-h-11 !justify-start !text-sm" disabled={!state || busy} onClick={() => { void prepareImage(); close(); }}>
                <ImageIcon className="h-4 w-4" aria-hidden="true" />{busy ? 'Preparing image…' : 'Preview share image'}
              </Button>
            </>}
            <Button variant="ghost" className="min-h-11 !justify-start !text-sm" disabled={!canExport} onClick={() => { exportCsv(); close(); }}>
              <Download className="h-4 w-4" aria-hidden="true" />Download CSV
            </Button>
          </div>}
        </ControlPopover>
      </div>
      <p role="status" className={message || busy ? 'py-1' : undefined}>{busy ? 'Preparing image…' : message}</p>
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
