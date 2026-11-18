'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_PATH, stations, type Station } from '@/lib/condition-days/study';
import { gaugeCoverage } from '@/lib/condition-days/gauge-coverage';
import styles from './report.module.css';

export function StudyPicker({ station, selectedSite, compare }: { station: Station; selectedSite: string; compare?: string }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const rivers = stations.filter((s, i) => stations.findIndex(r => r.slug === s.slug) === i);
  const reaches = stations.filter(s => s.slug === station.slug);
  const liveOnly = gaugeCoverage.filter(s => s.slug === station.slug);
  function navigate(site: string, second?: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('site', site);
    if (second) params.set('compare', second); else params.delete('compare');
    transition(() => router.push(REPORT_PATH + '?' + params, { scroll: false }));
  }
  return <div className={styles.picker} aria-busy={pending}>
    <label>River<select className="select" value={station.slug} disabled={pending} onChange={e => navigate(stations.find(s => s.slug === e.target.value)!.site)}>
      {rivers.map(s => <option key={s.slug} value={s.slug}>{s.river}</option>)}
    </select></label>
    <label>Gauge<select className="select" value={selectedSite} disabled={pending || reaches.length + liveOnly.length === 1} onChange={e => navigate(e.target.value)}>
      <optgroup label="Seasonal study">{reaches.map(s => <option key={s.site} value={s.site}>{s.label}</option>)}</optgroup>
      {liveOnly.length > 0 && <optgroup label="Live readings only">{liveOnly.map(s => <option key={s.site} value={s.site}>{s.label}</option>)}</optgroup>}
    </select></label>
    {selectedSite === station.site && reaches.length > 1 && <label><span>Compare<span className="sr-only"> stretches</span></span><select className="select" value={compare ?? ''} disabled={pending} onChange={e => navigate(station.site, e.target.value)}>
      <option value="">One stretch</option>
      {reaches.filter(s => s.site !== station.site).map(s => <option key={s.site} value={s.site}>{s.label}</option>)}
    </select></label>}
  </div>;
}
