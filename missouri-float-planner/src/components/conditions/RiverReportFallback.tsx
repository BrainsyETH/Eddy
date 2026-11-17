import Link from 'next/link';
import type { RiverListItem } from '@/types/api';
import ConditionBadge from '@/components/ui/ConditionBadge';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import RiverReadAppCta from '@/components/gauge/RiverReadAppCta';

/** Preserve the report's space and saved reading while its gauge metadata loads. */
export default function RiverReportFallback({ river, loading }: { river: RiverListItem; loading: boolean }) {
  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  const unit = condition?.thresholdUnit;
  const value = unit === 'cfs' ? condition?.dischargeCfs : unit === 'ft' ? condition?.gaugeHeightFt : null;
  return <div className="min-h-[380px] overflow-hidden rounded-xl border border-neutral-200 bg-white">
    <Link href={river.path} prefetch={false} className="block px-4 pt-4 sm:px-5">
      <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{river.name}</h2>
      <p className="mt-1 text-[13px] text-neutral-600">{river.state} · River length {Math.round(river.lengthMiles)} mi</p>
      <div className="my-3 flex items-center justify-between gap-3">
        <ConditionBadge code={code} size="sm" />
        {value != null && <span className="font-mono text-xl font-medium tabular-nums text-neutral-900">{unit === 'cfs' ? Math.round(value).toLocaleString() : value.toFixed(2)} {unit}</span>}
      </div>
    </Link>
    {river.primaryGaugeSiteId && unit ? <FlowTrendChart gaugeSiteId={river.primaryGaugeSiteId} days={14} displayUnit={unit} latestValue={value ?? null} chartClassName="h-32" interactive={false} showCurrent={false} />
      : <div className="mx-4 flex h-32 items-center justify-center rounded bg-neutral-50 text-sm text-neutral-500">{loading ? 'Loading river chart…' : 'Gauge details are unavailable.'}</div>}
    <div className="mx-4 my-3"><RiverReadAppCta slug={river.slug} name={river.name} /></div>
    <Link href={river.path} prefetch={false} className="mx-4 mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700">Full river report</Link>
  </div>;
}
