'use client';

// src/app/rivers/[slug]/RiverHeroStats.tsx
// Live at-a-glance metrics for the river hub hero (gauge height, flow, age).
// Reuses the primary-gauge data already fetched for the report section.

import { useRiverGroup } from '@/hooks/useRiverGroups';

function ageText(hours?: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) {
    const m = Math.round(hours * 60);
    return m < 2 ? 'Just now' : `${m}m ago`;
  }
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function RiverHeroStats({ riverSlug }: { riverSlug: string }) {
  const { riverGroup } = useRiverGroup(riverSlug);
  const g = riverGroup?.primaryGauge;

  const stats: { label: string; value: string; unit?: string }[] = [
    { label: 'Gauge height', value: g?.gaugeHeightFt != null ? g.gaugeHeightFt.toFixed(1) : '—', unit: 'ft' },
    { label: 'Flow', value: g?.dischargeCfs != null ? g.dischargeCfs.toLocaleString() : '—', unit: 'cfs' },
    { label: 'Updated', value: ageText(g?.readingAgeHours) },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl px-4 py-3 border border-white/15"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">{s.label}</div>
          <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
            {s.value}
            {s.unit && <span className="text-sm text-white/50 font-medium ml-1">{s.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
