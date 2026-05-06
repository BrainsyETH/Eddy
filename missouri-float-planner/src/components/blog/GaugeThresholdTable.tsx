// src/components/blog/GaugeThresholdTable.tsx
// Renders the primary gauge's 7-level threshold mapping straight from the
// river_gauges row. Numbers are live; vocabulary matches the rest of the
// app (CONDITION_LABELS in src/constants).

import { createAdminClient } from '@/lib/supabase/admin';

interface Props {
  riverSlug: string;
}

interface ThresholdRow {
  threshold_unit: 'ft' | 'cfs' | string;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  gauge_name?: string | null;
  usgs_site_id?: string | null;
}

function fmt(n: number | null, unit: string): string {
  if (n === null || n === undefined) return '—';
  return `${n} ${unit}`;
}

export default async function GaugeThresholdTable({ riverSlug }: Props) {
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', riverSlug)
    .single();

  if (!river) return null;

  const { data: gauge } = await supabase
    .from('river_gauges')
    .select(`
      threshold_unit,
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous
    `)
    .eq('river_id', river.id)
    .eq('is_primary', true)
    .single();

  if (!gauge) return null;

  const g = gauge as unknown as ThresholdRow;
  const unit = g.threshold_unit === 'cfs' ? 'cfs' : 'ft';

  const rows: { code: string; label: string; range: string; tone: string }[] = [
    {
      code: 'too_low',
      label: 'Too low',
      range: g.level_too_low !== null ? `< ${fmt(g.level_too_low, unit)}` : '—',
      tone: 'var(--color-neutral-500)',
    },
    {
      code: 'low',
      label: 'Low — scraping likely',
      range: `${fmt(g.level_too_low, unit)} – ${fmt(g.level_low, unit)}`,
      tone: '#92400E',
    },
    {
      code: 'good',
      label: 'Good — floatable',
      range: `${fmt(g.level_low, unit)} – ${fmt(g.level_optimal_min, unit)}`,
      tone: 'var(--color-support-700)',
    },
    {
      code: 'flowing',
      label: 'Flowing — prime',
      range: `${fmt(g.level_optimal_min, unit)} – ${fmt(g.level_optimal_max, unit)}`,
      tone: 'var(--color-support-700)',
    },
    {
      code: 'high',
      label: 'High — use caution',
      range: `${fmt(g.level_optimal_max, unit)} – ${fmt(g.level_dangerous, unit)}`,
      tone: '#A33122',
    },
    {
      code: 'dangerous',
      label: 'Dangerous — do not float',
      range: g.level_dangerous !== null ? `≥ ${fmt(g.level_dangerous, unit)}` : '—',
      tone: '#991B1B',
    },
  ];

  return (
    <div
      style={{
        marginTop: 18,
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        overflow: 'hidden',
      }}
    >
      <div>
        {rows.map((r, i) => (
          <div
            key={r.code}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 16,
              padding: '10px 18px',
              borderTop: i ? '1px dashed var(--color-neutral-200)' : 'none',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                color: r.tone,
                whiteSpace: 'nowrap',
              }}
            >
              {r.range}
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-neutral-800)' }}>{r.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
