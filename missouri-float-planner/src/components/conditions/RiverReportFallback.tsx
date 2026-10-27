import Image from 'next/image';
import Link from 'next/link';
import type { RiverListItem } from '@/types/api';
import ConditionBadge from '@/components/ui/ConditionBadge';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import { getEddyImageForCondition } from '@/constants';

/** Preserve the report's space and saved reading while its gauge metadata loads. */
export default function RiverReportFallback({ river, loading }: { river: RiverListItem; loading: boolean }) {
  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  const unit = condition?.thresholdUnit;
  const value = unit === 'cfs' ? condition?.dischargeCfs : unit === 'ft' ? condition?.gaugeHeightFt : null;
  return <div className="min-h-[380px] overflow-hidden rounded-xl border border-neutral-200 bg-white">
    <Link href={river.path} prefetch={false} className="block px-4 pt-4 sm:px-5">
      <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{river.name}</h2>
      <p className="mt-1 text-xs text-neutral-500">{river.state} · {Math.round(river.lengthMiles)} mi</p>
      <div className="my-3 flex items-center justify-between gap-3">
        <ConditionBadge code={code} size="sm" />
        {value != null && <span className="font-bold tabular-nums text-neutral-900">{unit === 'cfs' ? Math.round(value).toLocaleString() : value.toFixed(2)} {unit}</span>}
      </div>
    </Link>
    {river.primaryGaugeSiteId && unit ? <FlowTrendChart gaugeSiteId={river.primaryGaugeSiteId} days={14} displayUnit={unit} latestValue={value ?? null} chartClassName="h-32" interactive={false} />
      : <div className="mx-4 flex h-32 items-center justify-center rounded bg-neutral-50 text-sm text-neutral-500">{loading ? 'Loading river chart…' : 'Gauge details are unavailable.'}</div>}
    <div className="mx-4 my-4 flex items-center gap-3 rounded-lg bg-primary-50 p-3">
      <Image src={getEddyImageForCondition(code)} alt="Eddy the Otter" width={36} height={36} className="size-9 shrink-0 object-contain" />
      <p className="text-sm text-neutral-600">{loading ? 'Loading the latest river report…' : river.description ?? 'Open the river report for more information.'}</p>
    </div>
    <Link href={river.path} prefetch={false} className="mx-4 mb-4 inline-block text-xs font-medium text-primary-700">Full River Report</Link>
  </div>;
}
