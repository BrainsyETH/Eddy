'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import { scheduleDayLabel } from '@shared/dam-schedule-copy';
import { damPostSource, damStorySummary, ORIGINAL_STORY_DAM, type DamPostOption, type DamPostSnapshot, type DamStoryPlatform } from '@shared/social-dam-schedule';
import { nextHalfHourInput } from '@/lib/social/local-time';
import styles from './publishing.module.css';

const sendStamp = (at: string) => new Date(at).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CT';

export default function DamScheduleExport({ onQueued }: { onQueued: (message: string, partial: boolean) => void }) {
  const [dams, setDams] = useState<DamPostOption[]>([]);
  const [damId, setDamId] = useState(ORIGINAL_STORY_DAM.id);
  const selected = dams.find(dam => dam.id === damId);
  const [date, setDate] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<DamPostSnapshot | null>(null);
  const [platforms, setPlatforms] = useState<DamStoryPlatform[]>(['instagram', 'tiktok']);
  const [checking, setChecking] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  // A send time is the owner's approval in advance. A measured release changes hourly, so it is always reviewed.
  const canTime = selected?.kind === 'schedule' || selected?.kind === 'forecast';
  const [timed, setTimed] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [earliest, setEarliest] = useState('');
  const sending = timed && canTime;
  useEffect(() => {
    if (dams.length) return;
    let active = true;
    adminFetch('/api/admin/social/dam-schedule?catalog=1')
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) setDams(data.dams);
      }).catch(() => {
        if (active) { setChecking(false); setMessage('Could not load the dams. Try again.'); }
      });
    return () => { active = false; };
  }, [dams.length, refresh]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setChecking(true); setSnapshot(null); setMessage('');
    const query = new URLSearchParams({ damId: selected.id });
    if (date && selected.kind !== 'release') query.set('date', date);
    adminFetch(`/api/admin/social/dam-schedule?${query}`)
      .then(async response => {
        const data = await response.json();
        if (!active) return;
        if (data.today) setDates([data.today, data.tomorrow]);
        if (!response.ok) { setMessage(data.error || 'Could not check the dam data.'); return; }
        setSnapshot(data.snapshot);
      }).catch(() => { if (active) setMessage('Could not check the dam data. Try again.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [selected, date, refresh]);
  async function generate() {
    if (!snapshot || snapshot.dam?.id !== damId) return;
    setRendering(true); setMessage('');
    try {
      const response = await adminFetch('/api/admin/social/dam-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ damId, date: snapshot.kind === 'release' ? undefined : snapshot.scheduleDate, platforms, sendAt: sending ? sendAt : undefined }) });
      const data = await response.json();
      const errors = data.results?.filter((r: { error?: string }) => r.error).map((r: { platform: string; error: string }) => `${r.platform}: ${r.error}`).join(' ');
      const planned = response.ok && data.scheduledAt ? sendStamp(data.scheduledAt) : '';
      setMessage(response.ok ? `${planned ? `Scheduled for ${planned}.` : 'Preparing your video for review.'}${errors ? ` ${errors}` : ''}` : data.error || errors || 'Could not start the video.');
      if (response.ok) onQueued(errors ? `Some videos could not be prepared. ${errors}` : planned ? `Dam video scheduled for ${planned}` : 'Dam video queued for review', Boolean(errors));
    } catch { setMessage('Could not confirm whether the video started. Check History before trying again.'); }
    finally { setRendering(false); }
  }
  return <section aria-labelledby="dam-export-title" className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 mb-6 space-y-4">
    <div><h3 id="dam-export-title" className="text-lg font-semibold text-white">Dam generation video</h3><p className="text-sm text-neutral-400">12-second video · Review it first, or choose a send time.</p></div>
    <div className="flex flex-wrap gap-4 items-end">
      <label className="max-w-full text-sm text-neutral-300">Dam<select disabled={rendering || !dams.length} value={damId} onChange={e => { setSnapshot(null); setMessage(''); setDamId(e.target.value); setDate(''); setSendAt(''); }} className="block mt-1 max-w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white">{dams.map(dam => <option key={dam.id} value={dam.id}>{dam.name}</option>)}</select></label>
      {selected && selected.kind !== 'release' && selected.kind !== 'unavailable' && <label className="text-sm text-neutral-300">{selected.kind === 'forecast' ? 'Forecast' : 'Schedule'} date (Central)<select disabled={rendering} value={date || dates[0] || ''} onChange={e => { setSnapshot(null); setDate(e.target.value); setSendAt(''); }} className="block mt-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white">{dates.map(d => <option key={d} value={d}>{scheduleDayLabel(d)}</option>)}</select></label>}
      <button disabled={checking || rendering} onClick={() => setRefresh(n => n + 1)} className="px-3 py-2 text-sm text-primary-300 disabled:opacity-50">Refresh</button>
    </div>
    {checking ? <p role="status" className="text-sm text-neutral-300">Checking dam data…</p> : snapshot && <div className="border-l-4 border-primary-400 pl-3 text-neutral-200"><p className="font-semibold">{damStorySummary(snapshot)}</p><p className="text-sm text-neutral-400">{damPostSource(snapshot)}</p></div>}
    <fieldset disabled={rendering} className="flex flex-wrap gap-4 text-sm text-neutral-200"><legend className="sr-only">Video formats</legend>{(['instagram', 'tiktok'] as const).map(p => <label key={p} className="flex items-center gap-2"><input type="checkbox" checked={platforms.includes(p)} onChange={e => setPlatforms(previous => e.target.checked ? [...previous, p] : previous.filter(value => value !== p))} />{p === 'instagram' ? 'Instagram Story' : 'TikTok'}</label>)}</fieldset>
    {canTime && <div className="space-y-3">
      <div className={styles.mode} role="group" aria-label="When to send">
        <button type="button" style={{ textTransform: 'none' }} disabled={rendering} aria-pressed={!timed} onClick={() => setTimed(false)}>Review first</button>
        <button type="button" style={{ textTransform: 'none' }} disabled={rendering} aria-pressed={timed} onClick={() => { setEarliest(nextHalfHourInput('America/Chicago')); setTimed(true); }}>Send at a set time</button>
      </div>
      {timed && <label className={styles.field}>Send at (Central)
        <input type="datetime-local" step={1800} disabled={rendering} min={earliest} max={snapshot ? snapshot.scheduleDate + 'T23:30' : undefined} value={sendAt} onChange={e => setSendAt(e.target.value)}/>
        <small>Posts without another review. Eddy checks the {selected.kind === 'forecast' ? 'forecast' : 'schedule'} again first and makes a new video if it changed.</small>
      </label>}
    </div>}
    <button onClick={generate} disabled={!snapshot || snapshot.dam?.id !== damId || checking || rendering || !platforms.length || (sending && !sendAt)} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg disabled:opacity-50">{rendering ? 'Creating video…' : sending ? 'Create and schedule' : 'Create video'}</button>
    <p role="status" className="text-sm text-neutral-300">{message}</p>
  </section>;
}
