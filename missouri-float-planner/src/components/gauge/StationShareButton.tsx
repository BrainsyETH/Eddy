'use client';
import { useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { gaugeSharePath, type ShareStation } from '@shared/chart-share';
import Button from '@/components/ui/Button';

export default function StationShareButton({
  station,
  title,
  label = 'Share station',
}: {
  station: ShareStation;
  title?: string;
  label?: string;
}) {
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  async function share() {
    if (pending.current) return;
    pending.current = true;
    setMessage('');
    try {
      const url = new URL(gaugeSharePath(station), window.location.origin).href;
      // Touch devices get the share sheet; desktop copies, like the page's other Share buttons.
      if (window.matchMedia('(pointer: coarse)').matches && navigator.share)
        await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setMessage('Could not share. Please try again.');
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <Button size="sm" variant="outline" onClick={share} className="min-h-11" aria-label={title ? `Share ${title}` : label}>
        <Share2 className="size-4 shrink-0" aria-hidden="true" /> {label}
      </Button>
      <span role="status" className="text-xs">
        {message}
      </span>
    </div>
  );
}
