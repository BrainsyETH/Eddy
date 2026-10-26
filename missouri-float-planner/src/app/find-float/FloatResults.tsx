import Image from 'next/image';
import type { MouseEvent } from 'react';
import { ArrowRight, Clock, MapPin, Waves } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ConditionBadge from '@/components/ui/ConditionBadge';
import Skeleton from '@/components/ui/Skeleton';
import { optimizeBlogImage } from '@/lib/blog-image';
import type { RiverListItem } from '@/types/api';
import { floatRangeLabel, publicAccessLabel, floatPlanPath, floatSearchEmptyMessage, floatSearchUsedProximity, FLOAT_SEARCH_PROXIMITY_NOTE, type FloatSearchOption } from '@shared/float-search';
import type { SearchSnapshot } from './FindFloatClient';

const FEATURED_RIVERS = ['current', 'eleven-point', 'buffalo', 'jacks-fork', 'meramec'];

export function RiverInspiration({ rivers, selectedRiver, loading, onChoose }: {
  rivers: RiverListItem[];
  selectedRiver?: string;
  loading: boolean;
  onChoose: (river: RiverListItem) => void;
}) {
  const pictured = rivers.filter(r => r.photoUrl && r.accessPointCount >= 2);
  const featured = [...pictured].sort((a, b) => {
    const rank = (slug: string) => { const index = FEATURED_RIVERS.indexOf(slug); return index < 0 ? FEATURED_RIVERS.length : index; };
    return rank(a.slug) - rank(b.slug);
  }).slice(0, 3);
  return (
    <>
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--color-text-secondary)]">Your next day outside</p>
        <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-medium">A little river inspiration</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Pick a river to explore. We’ll check conditions when you find routes.</p>
      </div>
      {loading ? <div aria-label="Loading rivers" className="space-y-4"><Skeleton className="h-64 w-full rounded-lg" /><Skeleton className="h-40 w-full rounded-lg" /></div>
        : featured.length ? <div className="grid gap-5 sm:grid-cols-2">
          {featured.map((river, index) => <Card key={river.id} variant="framed" as="article" className={`overflow-hidden ${index === 0 ? 'sm:col-span-2' : ''}`}>
            <div className={`relative ${index === 0 ? 'h-56' : 'h-36'}`}>
              <Image src={river.photoUrl!} alt={river.name} fill loading={index === 0 ? 'eager' : 'lazy'} unoptimized={!optimizeBlogImage(river.photoUrl!)} sizes={index === 0 ? '(min-width: 1280px) 820px, (min-width: 1024px) 60vw, 100vw' : '(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw'} className="object-cover" />
            </div>
            <div className="flex flex-1 flex-col items-start gap-3 p-4 sm:p-5">
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-bold">{river.name}</h3>
                {river.state && <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"><MapPin size={13} aria-hidden="true" />{river.state}</span>}
              </div>
              {index === 0 && river.description && <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">{river.description}</p>}
              <Button variant="outline" className="mt-auto" aria-pressed={selectedRiver === river.slug} onClick={() => onChoose(river)}>
                {selectedRiver === river.slug ? 'River selected' : 'Choose river'}<ArrowRight size={15} aria-hidden="true" />
                <span className="sr-only">: {river.name}</span>
              </Button>
            </div>
          </Card>)}
        </div> : <Card variant="trip" className="flex min-h-64 flex-col items-start justify-center gap-4 p-6">
          <Waves size={40} className="text-primary-500" aria-hidden="true" />
          <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-2xl">There’s a float for your kind of day.</h3>
          <p className="max-w-md text-[var(--color-text-secondary)]">Choose a town or river, your time on the water, and a Vessel. Eddy will look for routes that fit.</p>
        </Card>}
    </>
  );
}

export function FloatResults({ snapshot, dirty, busy, onPlan }: {
  snapshot: SearchSnapshot;
  dirty: boolean;
  busy: boolean;
  onPlan: () => boolean;
}) {
  const { data, input, location } = snapshot;
  const blocked = dirty || busy;
  return (
    <>
      <div className="mb-5" aria-live="polite">
        <p className="mb-2 text-sm text-[var(--color-text-secondary)]">{location}</p>
        <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-medium">{data.matches.length ? `${data.matches.length} ${data.matches.length === 1 ? 'route' : 'routes'} for your day` : 'Let’s find your fit'}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">About {input.targetHours} hours · <span className="capitalize">{input.vesselType}</span>{input.publicOnly ? ' · Public accesses' : ''}</p>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Checked {new Date(data.estimatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Conditions can change.</p>
      </div>
      {blocked && <Card variant="panel" className="mb-5 p-4"><p role="status" className="text-sm font-medium">{busy ? 'Updating your search. Previous results are shown below.' : 'Your choices changed. Update routes to see matching floats.'}</p></Card>}
      {data.partial && <Card variant="panel" className="mb-5 p-4"><p role="status" className="text-sm">{data.failed ? 'Some river data was unavailable. ' : ''}This is a partial search. Try again or choose a river for a closer look.</p></Card>}
      {data.matches.length === 0 && <Card variant="panel" className="mb-5 p-5"><p>{floatSearchEmptyMessage(data)}</p></Card>}
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
