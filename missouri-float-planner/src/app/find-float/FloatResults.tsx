import Image from 'next/image';
import type { MouseEvent } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { optimizeBlogImage } from '@/lib/blog-image';
import { floatRangeLabel, publicAccessLabel, floatPlanPath, floatSearchEmptyMessage, floatSearchUsedProximity, FLOAT_SEARCH_PROXIMITY_NOTE, FLOAT_SEARCH_LOADING_TITLE, FLOAT_SEARCH_LOADING_DETAIL, type floatSearchRecoveryOptions, type FloatSearchOption } from '@shared/float-search';
import type { SearchSnapshot } from './FindFloatClient';

export function FloatSearchLoading({ compact = false }: { compact?: boolean }) {
  return <Card variant="panel" role="status" aria-live="polite"
    style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-300) 8%, var(--color-surface))', borderColor: 'var(--color-primary-300)' }}
    className={`mb-5 flex flex-col items-center justify-center gap-4 px-6 text-center ${compact ? 'py-6' : 'min-h-96 py-12 sm:min-h-[480px]'}`}>
    <EddyIcon name="checkingGauge" size={compact ? 100 : 190} />
    <h2 style={{ fontFamily: 'var(--font-display)' }} className={compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}>{FLOAT_SEARCH_LOADING_TITLE}</h2>
    <p className="text-sm text-[var(--color-text-secondary)]">{FLOAT_SEARCH_LOADING_DETAIL}</p>
    <div className="flex gap-2 py-2 text-[var(--color-text-secondary)]" aria-hidden="true">
      {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
    </div>
  </Card>;
}

export function FloatResults({ snapshot, dirty, busy, onPlan, recoveryOptions, onRecover }: {
  snapshot: SearchSnapshot;
  dirty: boolean;
  busy: boolean;
  onPlan: () => boolean;
  recoveryOptions: ReturnType<typeof floatSearchRecoveryOptions>;
  onRecover: (option: ReturnType<typeof floatSearchRecoveryOptions>[number]) => void;
}) {
  const { data, input, location } = snapshot;
  const blocked = dirty || busy;
  return (
    <>
      <div className="mb-5" aria-live="polite">
        <p className="mb-2 text-sm text-[var(--color-text-secondary)]">{location}</p>
        <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-medium">Matching Floats</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{data.matches.length} {data.matches.length === 1 ? 'route' : 'routes'} · About {input.targetHours} hours · <span className="capitalize">{input.vesselType}</span>{input.publicOnly ? ' · Public accesses' : ''}</p>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Checked {new Date(data.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Conditions can change.</p>
      </div>
      {dirty && !busy && <Card variant="panel" className="mb-5 p-4"><p role="status" className="text-sm font-medium">Your choices changed. Update routes to see matching floats.</p></Card>}
      {data.partial && <Card variant="panel" className="mb-5 p-4"><p role="status" className="text-sm">{data.failed ? 'Some river data was unavailable. ' : ''}This is a partial search. Try again or choose a river for a closer look.</p></Card>}
      {data.matches.length === 0 && <Card variant="panel" className="mb-5 space-y-4 p-5"><p>{floatSearchEmptyMessage(data)}</p>
        {!blocked && recoveryOptions.length > 0 && <div className="flex flex-wrap gap-3">{recoveryOptions.map(option => <Button key={option.label} variant="outline" onClick={() => onRecover(option)}>{option.label}<ArrowRight size={16} aria-hidden="true" /></Button>)}</div>}
      </Card>}
      <div className="space-y-5" aria-label="Matching routes">
        {data.matches.map(option => <FloatCard key={option.id} option={option} blocked={blocked} onPlan={onPlan} />)}
      </div>
      {data.alternatives.length > 0 && <section className="mt-8" aria-label="Alternative routes">
        <h3 className="text-xl font-bold">A little shorter or longer</h3>
        <p className="mb-4 mt-1 text-sm text-[var(--color-text-secondary)]">These ranges don’t include {input.targetHours} hours.</p>
        <div className="space-y-5">{data.alternatives.map(option => <FloatCard key={option.id} option={option} blocked={blocked} onPlan={onPlan} />)}</div>
      </section>}
      <details className="mt-5 text-sm text-[var(--color-text-secondary)]">
        <summary className="cursor-pointer py-3 font-medium">How these estimates work</summary>
        <p>Times include ordinary stops. A route matches when its estimated range includes your chosen time. Estimates use current conditions where available.</p>
        {floatSearchUsedProximity(data) && <p className="mt-2">{FLOAT_SEARCH_PROXIMITY_NOTE}</p>}
      </details>
    </>
  );
}

function FloatCard({ option: o, blocked, onPlan }: { option: FloatSearchOption; blocked: boolean; onPlan: () => boolean }) {
  return (
    <Card variant="framed" as="article" className="overflow-hidden">
      <div className={`grid ${o.photo ? 'xl:grid-cols-[210px_minmax(0,1fr)]' : ''}`}>
        {o.photo && <div className="relative min-h-44 xl:min-h-full">
          {/* Access photographs can come from hosts outside the optimizer allowlist. */}
          <Image src={o.photo.url} alt={o.photo.caption} fill unoptimized={!optimizeBlogImage(o.photo.url)} sizes="(min-width: 1280px) 210px, 100vw" className="object-cover" />
        </div>}
        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{o.riverName}</p>
            {/* Canonical chips use translucent tints and dark ink; retain their
                light backing on a dark card as well. */}
            <span className="inline-flex rounded-full bg-white"><ConditionBadge code={o.conditionCode ?? 'unknown'} label={o.conditionLabel} /></span>
          </div>
          <h3 className="mt-3 text-xl font-bold leading-snug">{o.putIn.name} <span aria-label="to">→</span> {o.takeOut.name}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base font-bold">
            <span className="inline-flex items-center gap-2"><Clock size={17} aria-hidden="true" />{floatRangeLabel(o.timeRange)}</span>
            <span>{o.distanceMiles.toFixed(1)} river miles</span>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            {o.estimateBasis === 'current_conditions' ? 'Current conditions' : 'Typical conditions'}
            {o.observedAt && o.estimateBasis === 'current_conditions' ? ` · Reading ${new Date(o.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
          </p>
          {o.description && <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text-secondary)]">{o.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {o.putIn.isPublic === true && o.takeOut.isPublic === true ? <Badge tone="secondary">Public put-in &amp; take-out</Badge>
              : <p>Put-in: {publicAccessLabel(o.putIn.isPublic)} · Take-out: {publicAccessLabel(o.takeOut.isPublic)}</p>}
          </div>
          {o.conditional && <p className="mt-3 text-sm font-bold">Check cautions before planning.</p>}
          {o.cautions.map((caution, i) => <p className="mt-2 text-sm font-medium" key={i}>{caution}</p>)}
          <div className="mt-4">
            {blocked ? <Button variant="outline" disabled>Update routes to continue</Button>
              : <Button href={floatPlanPath(o)} variant="outline" onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (!onPlan()) event.preventDefault(); }}>Build this route<ArrowRight size={16} aria-hidden="true" /></Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}
