import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { riverPath } from '@/lib/navigation/river-path';
import { LAKE_SYSTEM_STAGE_LABELS, lakeSystemRowCopy, lakeSystemRowRelation } from '@shared/lake-system';
import type { LakeSystemRow, LakeSystemStage } from '@shared/lake-types';

const STAGES: LakeSystemStage[] = ['coming_in', 'dam', 'below'];

function rowIcon(row: LakeSystemRow): EddyIconName {
  if (row.kind === 'inflow') return 'inflow';
  if (row.kind === 'river') return 'river';
  return row.stage === 'below' ? 'damGauge' : 'dam';
}

function rowHref(row: LakeSystemRow): string | null {
  if (row.kind === 'river') return riverPath(row.state, row.slug);
  if (row.kind === 'dam') return `/dams/${row.damId}`;
  return null;
}

function rowKey(row: LakeSystemRow): string {
  return row.kind === 'river' ? `river:${row.slug}` : row.kind === 'dam' ? `dam:${row.damId}` : 'inflow';
}

function Row({ row, now }: { row: LakeSystemRow; now: number }) {
  const copy = lakeSystemRowCopy(row, now);
  if (!copy) return null;
  const relation = lakeSystemRowRelation(row);
  const href = rowHref(row);
  const body = <>
    <EddyIcon name={rowIcon(row)} size={28} />
    <span className="min-w-0 flex-1">
      <span className="block font-heading text-base font-bold leading-5 text-primary-900">{copy.title}</span>
      {relation && <span className="block text-xs leading-5 text-neutral-500">{relation}</span>}
      {copy.facts.length > 0 && <span className={`block text-sm leading-5 text-neutral-700 ${copy.stale ? 'opacity-70' : ''}`}>{copy.facts.join(' · ')}</span>}
    </span>
    {copy.age && <span className={`shrink-0 text-xs ${copy.stale ? 'font-semibold text-accent-900' : 'text-neutral-500'}`}>{copy.age}{copy.stale ? ' · Outdated' : ''}</span>}
    {href && <ChevronRight className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />}
  </>;
  const className = 'flex min-h-11 items-center gap-3 px-4 py-2.5 sm:px-5';
  return <li data-lake-system-row={rowKey(row)}>
    {href
      ? <Link href={href} prefetch={false} className={`${className} transition-colors hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-600`}>{body}</Link>
      : <div className={className}>{body}</div>}
  </li>;
}

/** The lake's neighbours, upstream to downstream. Each row opens the page Eddy already has for it. */
export default function LakeSystem({ rows, now }: { rows: LakeSystemRow[]; now: number }) {
  const groups = STAGES.map((stage) => ({ stage, rows: rows.filter((row) => row.stage === stage) })).filter((group) => group.rows.length > 0);
  if (!groups.length) return null;
  return <Card as="section" variant="panel" className="overflow-hidden" aria-labelledby="lake-system-heading" data-lake-system>
    <h2 id="lake-system-heading" className="flex items-center gap-2 px-4 pt-4 font-heading text-lg font-bold text-primary-800 sm:px-5 sm:pt-5"><EddyIcon name="river" size={28} />Water in and out</h2>
    {groups.map((group) => <div key={group.stage} className="mt-3 border-t border-neutral-200 first-of-type:border-t-0">
      <h3 className="px-4 pt-3 text-xs font-semibold text-neutral-600 sm:px-5">{LAKE_SYSTEM_STAGE_LABELS[group.stage]}</h3>
      <ul>{group.rows.map((row) => <Row key={rowKey(row)} row={row} now={now} />)}</ul>
    </div>)}
  </Card>;
}
