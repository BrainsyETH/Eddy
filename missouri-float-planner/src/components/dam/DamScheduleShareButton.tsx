'use client';

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { Check, Copy, Download, Link2, Loader2, Share2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  DAM_SCHEDULE_IMAGE_SIZE, damScheduleFileName, damScheduleImagePath,
  damSchedulePath, damScheduleTitle, scheduleShareDate,
} from '@shared/dam-schedule-share';

type Preview = { file: File; url: string; date: string; canShare: boolean; canCopy: boolean };

/** The preview bytes are the attachment. A second, direct gesture opens Web Share. */
export default function DamScheduleShareButton({ damId, name, dates }: {
  damId: string; name: string; dates: string[];
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const sharing = useRef(false);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dates[0] ?? '');
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const ready = preview?.date === date ? preview : null;

  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setPreview(null);
    setError('');
    setMessage('');
    void (async () => {
      try {
        const response = await fetch(damScheduleImagePath(damId, date), { signal: controller.signal });
        if (response.status === 422) throw new Error('This dated schedule is unavailable. Open the dam for the latest schedule.');
        if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('Could not prepare the image. Try again or copy the dam link.');
        const blob = await response.blob();
        if (!active) return;
        const file = new File([blob], `${damScheduleFileName(damId, date)}.png`, { type: 'image/png' });
        objectUrl = URL.createObjectURL(file);
        setPreview({ file, url: objectUrl, date,
          canShare: typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] })),
          canCopy: typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write),
        });
      } catch (failure) {
        if (active) setError(failure instanceof Error && failure.name !== 'AbortError'
          ? failure.message : 'The image took too long to load. Try again or copy the dam link.');
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, date, retry, damId]);

  async function act(action: 'share' | 'copy' | 'link') {
    if (sharing.current || (action !== 'link' && !ready)) return;
    sharing.current = true;
    setWorking(true);
    setMessage('');
    const link = new URL(`/dams/${encodeURIComponent(damId)}#generation`, window.location.origin).href;
    try {
      if (action === 'link') {
        await navigator.clipboard.writeText(link);
        setMessage('Dam link copied.');
      } else if (action === 'share' && ready) {
        const title = damScheduleTitle(name, ready.date);
        await navigator.share({ files: [ready.file], title, text: `${title}\n${link}` });
      } else if (ready) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': ready.file })]);
        setMessage('Image copied.');
      }
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === 'AbortError'))
        setMessage(action === 'link' ? 'Could not copy the link. Open the dam page below.' : 'Could not share the image. Try downloading it.');
    } finally {
      sharing.current = false;
      setWorking(false);
    }
  }

  if (!dates.length) return null;
  return <>
    <a
      href={damSchedulePath(damId, dates[0])}
      className="btn-outline btn--sm min-h-11 shrink-0 gap-2"
      aria-label={`Share ${name} generation schedule`} aria-haspopup="dialog" aria-controls={`${id}-dialog`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setDate(dates[0]);
        setOpen(true);
        dialog.current?.showModal();
      }}
    ><Share2 className="size-4" aria-hidden="true" /><span>Share</span></a>
    <dialog id={`${id}-dialog`} ref={dialog} aria-labelledby={`${id}-title`}
      onClose={() => { setOpen(false); setPreview(null); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-neutral-950/40 sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:w-[min(42rem,calc(100vw-2rem))] sm:rounded-2xl"
    >
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id={`${id}-title`} className="font-heading text-xl font-bold text-primary-800">Share schedule</h2><p className="mt-1 text-sm text-neutral-600">{name}</p></div>
          <Button variant="icon" autoFocus aria-label="Close schedule sharing" onClick={() => dialog.current?.close()} className="size-11 shrink-0"><X className="size-5" aria-hidden="true" /></Button>
        </div>
        <label htmlFor={`${id}-date`} className="mb-1 mt-4 block text-sm font-medium">Schedule date</label>
        <select id={`${id}-date`} value={date} disabled={working} onChange={event => setDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-primary-600">
          {dates.map(value => <option key={value} value={value}>{scheduleShareDate(value)} · Central Time</option>)}
        </select>
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50" aria-busy={!ready && !error}>
          {ready ? <Image src={ready.url} alt={`${name} generation schedule for ${scheduleShareDate(ready.date)}, Central Time`} {...DAM_SCHEDULE_IMAGE_SIZE} unoptimized className="h-auto w-full" />
            : <div className="flex aspect-[3/2] flex-col items-center justify-center gap-3 px-5 text-center text-sm text-neutral-600">
              {error ? <><p role="alert">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Try again</Button></>
                : <><Loader2 aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" /><p role="status">Preparing schedule image…</p></>}
            </div>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ready?.canShare && <Button size="sm" variant="secondary" disabled={working} onClick={() => void act('share')} className="min-h-11 gap-2"><Share2 className="size-4" aria-hidden="true" />Share image</Button>}
          {ready?.canCopy && <Button size="sm" variant="outline" disabled={working} onClick={() => void act('copy')} className="min-h-11 gap-2"><Copy className="size-4" aria-hidden="true" />Copy image</Button>}
          {ready && <a href={ready.url} download={ready.file.name} className="btn-outline btn--sm min-h-11 gap-2"><Download className="size-4" aria-hidden="true" />Download</a>}
          <Button size="sm" variant="outline" disabled={working} onClick={() => void act('link')} className="min-h-11 gap-2"><Link2 className="size-4" aria-hidden="true" />Copy dam link</Button>
        </div>
        <p role="status" className="mt-2 flex min-h-5 items-center gap-1 text-sm text-primary-700">{message.endsWith('copied.') && <Check className="size-4" aria-hidden="true" />}{message}</p>
        <p className="mt-2 text-xs text-neutral-600">A dated copy of the posted plan. Schedules can change. <a href={`/dams/${encodeURIComponent(damId)}#generation`} className="underline underline-offset-2">View latest schedule</a></p>
      </div>
    </dialog>
  </>;
}
