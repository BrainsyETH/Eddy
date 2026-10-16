'use client';
import { useRef, useState } from 'react';
import { gaugeSharePath, type ShareStation } from '@shared/chart-share';
import Button from '@/components/ui/Button';

export default function StationShareButton({ station }: { station: ShareStation }) {
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  async function share() {
    if (pending.current) return;
    pending.current = true;
    try {
      const url = new URL(gaugeSharePath(station), window.location.origin).href;
      if (navigator.share) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); setMessage('Link copied.'); }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Could not share. Please try again.'); }
    finally { pending.current = false; }
  }
  return <div><Button size="sm" variant="outline" onClick={share}>Share station</Button><span role="status" className="ml-2 text-xs">{message}</span></div>;
}
