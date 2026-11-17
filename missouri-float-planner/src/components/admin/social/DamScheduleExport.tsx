'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import { scheduleDayLabel } from '@shared/dam-schedule-copy';
import { damStoryWindows, type DamStorySnapshot, type DamStoryPlatform } from '@shared/social-dam-schedule';

export default function DamScheduleExport({ onQueued }: { onQueued: () => void }) {
  const [date, setDate] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<DamStorySnapshot | null>(null);
  const [platforms, setPlatforms] = useState<DamStoryPlatform[]>(['instagram', 'tiktok']);
  const [checking, setChecking] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setChecking(true); setSnapshot(null); setMessage('');
    adminFetch(`/api/admin/social/dam-schedule${date ? `?date=${date}` : ''}`)
      .then(async response => {
        const data = await response.json();
        if (!active) return;
        if (data.today) setDates([data.today, data.tomorrow]);
        if (!response.ok) { setMessage(data.error || 'Could not check the schedule.'); return; }
        setSnapshot(data.snapshot);
      }).catch(() => { if (active) setMessage('Could not check the schedule. Try again.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [date, refresh]);
  async function generate() {
    if (!snapshot) return;
    setRendering(true); setMessage('');
    try {
      const response = await adminFetch('/api/admin/social/dam-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: snapshot.scheduleDate, platforms }) });
      const data = await response.json();
      const errors = data.results?.filter((r: { error?: string }) => r.error).map((r: { platform: string; error: string }) => `${r.platform}: ${r.error}`).join(' ');
      setMessage(response.ok ? `Video rendering. Open History to preview and download when ready.${errors ? ` ${errors}` : ''}` : data.error || errors || 'Could not start the render.');
      onQueued();
    } catch { setMessage('Could not confirm the render. Check History before trying again.'); }
    finally { setRendering(false); }
  }
  const windows = snapshot ? damStoryWindows(snapshot.hours) : [];
  return <section aria-labelledby="dam-export-title" className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 mb-6 space-y-4">
    <div><h3 id="dam-export-title" className="text-lg font-semibold text-white">Dam schedule video</h3><p className="text-sm text-neutral-400">Table Rock · 12-second animation · Download and post manually.</p></div>
    <div className="flex flex-wrap gap-4 items-end">
      <label className="text-sm text-neutral-300">Schedule date (Central)<select disabled={rendering} value={date || dates[0] || ''} onChange={e => setDate(e.target.value)} className="block mt-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white">{dates.map(d => <option key={d} value={d}>{scheduleDayLabel(d)}</option>)}</select></label>
      <button disabled={checking || rendering} onClick={() => setRefresh(n => n + 1)} className="px-3 py-2 text-sm text-primary-300 disabled:opacity-50">Check schedule</button>
    </div>
    {checking ? <p role="status" className="text-sm text-neutral-300">Checking the posted schedule…</p> : snapshot && <div className="border-l-4 border-primary-400 pl-3 text-neutral-200"><p className="font-semibold">{windows.length ? `Scheduled generation: ${windows.join(', ')}` : 'No generation scheduled'}</p><p className="text-sm text-neutral-400">Central time · SWPA · Eddy checked {new Date(snapshot.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</p></div>}
    <fieldset disabled={rendering} className="flex flex-wrap gap-4 text-sm text-neutral-200"><legend className="sr-only">Video formats</legend>{(['instagram', 'tiktok'] as const).map(p => <label key={p} className="flex items-center gap-2"><input type="checkbox" checked={platforms.includes(p)} onChange={e => setPlatforms(previous => e.target.checked ? [...previous, p] : previous.filter(value => value !== p))} />{p === 'instagram' ? 'Instagram Story' : 'TikTok'}</label>)}</fieldset>
    <button onClick={generate} disabled={!snapshot || checking || rendering || !platforms.length} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg disabled:opacity-50">{rendering ? 'Starting render…' : 'Generate video'}</button>
    <p role="status" className="text-sm text-neutral-300">{message}</p>
  </section>;
}
