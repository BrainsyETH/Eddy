// Shared access reading: the same condition system and reading/station hierarchy as iOS.
import type { AccessPointGaugeStatus } from '@/types/api';
import { stationCaption } from '@shared/station-caption';
import { conditionChip } from '@shared/condition-system';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { EddyIcon } from '@/components/ui/EddyIcon';

export default function AccessPointGauge({ gaugeStatus }: { gaugeStatus: AccessPointGaugeStatus | null }) {
  if (!gaugeStatus) return <p className="flex items-center gap-2 text-sm text-neutral-600"><EddyIcon name="gauge" size={24} />Water level unavailable</p>;
  const chip = conditionChip(gaugeStatus.level);
  const lastUpdated = gaugeStatus.lastUpdated ? formatTimeAgo(new Date(gaugeStatus.lastUpdated)) : null;
  const caption = stationCaption(gaugeStatus.provider, gaugeStatus.usgsId);
  return <section aria-label="Water conditions" className="border-y-2 border-neutral-200 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <EddyIcon name="gauge" size={26} />
      <span className="font-mono text-base font-semibold tabular-nums" style={{ color: chip.color }}>
        {gaugeStatus.cfs !== null ? `${gaugeStatus.cfs.toLocaleString()} cfs` : gaugeStatus.heightFt !== null ? `${gaugeStatus.heightFt.toFixed(2)} ft` : 'No reading'}
      </span>
      <ConditionBadge code={gaugeStatus.level} label={gaugeStatus.label} />
    </div>
    <p className="mt-1 text-xs font-semibold text-neutral-700">{gaugeStatus.gaugeName}</p>
    <p className="mt-1 text-xs text-neutral-600">
      {[gaugeStatus.cfs !== null && gaugeStatus.heightFt !== null ? `${gaugeStatus.heightFt.toFixed(2)} ft` : null,
        gaugeStatus.trend ? `${gaugeStatus.trend === 'rising' ? '↑ Rising' : gaugeStatus.trend === 'falling' ? '↓ Falling' : '→ Steady'}` : null,
        caption, lastUpdated ? `Updated ${lastUpdated}` : null].filter(Boolean).join(' · ')}
    </p>
  </section>;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
