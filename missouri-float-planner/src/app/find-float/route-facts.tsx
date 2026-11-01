// Route facts for Find a Float. Time and condition labels are shared with
// the river strip; access, highlights, cautions and details sit on the card.
//
// Every icon on the card sits beside words. A phone has no hover, so a mark
// that needs a tooltip to mean anything means nothing there. The collapsed card
// carries only what tells floats apart; the inventory (each end, every stop,
// every outfitter) is organized in route details.

import type { ReactNode } from 'react';
import { Info, Lock } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { trackEvent } from '@/lib/analytics';
import {
  FLOAT_CAUTION_LABELS, FLOAT_FACILITY_LABELS, FLOAT_OUTFITTER_MATCH_LABELS, FLOAT_STOP_LABELS, floatCardHighlights, floatRangeLabel,
  outfitterServiceLabel, publicAccessLabel, routeAccessText, sortFloatCautions,
  type FloatCaution, type FloatEndpointFacts, type FloatHighlightKind, type FloatSearchFilters, type FloatSearchOption, type FloatStop,
} from '@shared/float-search';

/** InfoTip colours shared by the cards and the river strip. */
export const INFO_COLORS = {
  trigger: 'var(--color-text-link)', triggerBorder: 'var(--color-border-strong)',
  popBg: 'var(--color-surface)', popBorder: 'var(--color-text-link)', title: 'var(--color-text-primary)',
  body: 'var(--color-text-secondary)', focus: 'var(--color-text-link)',
};

export function routeTimeLabel(o: FloatSearchOption) {
  return floatRangeLabel(o.timeRange).replace(' hours', ' hr');
}

export function routeEstimateLabel(o: FloatSearchOption) {
  return o.estimateBasis === 'typical' ? 'Typical estimate' : 'Estimated time';
}

export function RouteConditionBadge({ option: o }: { option: FloatSearchOption }) {
  return <span className="inline-flex rounded-full bg-white"><ConditionBadge code={o.conditionCode ?? 'unknown'} label={o.conditionLabel} /></span>;
}

export function routeCautionsPresent(o: FloatSearchOption) {
  return o.cautions.length > 0 || Boolean(o.conditional);
}

/** Structured cautions, most specific first; older payloads become unscoped "verify" items. */
export function routeCautionItems(o: FloatSearchOption): FloatCaution[] {
  const items = o.cautionItems ?? o.cautions.map(detail => ({ scope: 'check' as const, summary: detail, detail }));
  if (!items.length && o.conditional) return [{ scope: 'check', summary: 'Check route cautions before going.', detail: 'Check route cautions before going.' }];
  return sortFloatCautions(items);
}

/** Public access, or which end is private, in words. */
export function RouteAccessBadge({ option: o }: { option: FloatSearchOption }) {
  const access = routeAccessText(o);
  return access.private
    ? <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent-300)] bg-[var(--color-accent-50)] px-2 py-0.5 text-xs font-semibold text-[var(--color-accent-900)]">
      <Lock size={12} aria-hidden="true" />{access.text}<span className="sr-only">: permission required</span>
    </span>
    : <span className="text-sm text-[var(--color-text-secondary)]">{access.text}</span>;
}

const HIGHLIGHT_ICONS: Record<FloatHighlightKind, EddyIconName> = {
  outfitter: 'outfitter',
  camping: 'campground',
  restrooms: 'facilities',
  spring: 'spring',
  sight: 'accessPoint',
  access: 'boatRamp',
};

/** Up to two facts that tell this float apart, each an icon beside its words. */
export function RouteHighlights({ option: o, filters }: { option: FloatSearchOption; filters?: FloatSearchFilters }) {
  const highlights = floatCardHighlights(o, filters);
  if (!highlights.length) {
    // Payloads from before endpoint facts existed still carry text highlights.
    return o.endpointFacts || !o.highlights?.length ? null
      : <p className="text-sm text-[var(--color-text-secondary)]">{o.highlights.join(' · ')}</p>;
  }
  return <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]" aria-label="Highlights">
    {highlights.map(highlight => <li key={highlight.kind} className="flex min-w-0 items-center gap-2">
      <EddyIcon name={HIGHLIGHT_ICONS[highlight.kind]} size={20} className="shrink-0" />
      <span className="min-w-0 truncate">{highlight.label}</span>
    </li>)}
  </ul>;
}

function CautionMark({ scope, size = 18 }: { scope: FloatCaution['scope']; size?: number }) {
  return scope === 'route' || scope === 'endpoint'
    ? <EddyIcon name="hazard" size={size} className="shrink-0" />
    : <Info size={size - 2} aria-hidden="true" className="shrink-0 text-[var(--color-text-secondary)]" />;
}

/**
 * One line: where the most specific caution applies, then its own short
 * summary. The scope label never truncates, so "Area notice" always reads as
 * an area notice. Pressing it opens the full text in route details.
 */
export function RouteCautionRow({ option: o, onOpen }: { option: FloatSearchOption; onOpen: () => void }) {
  const items = routeCautionItems(o);
  if (!items.length) return null;
  const [first] = items;
  const confirmed = first.scope === 'route' || first.scope === 'endpoint';
  return <button type="button" onClick={onOpen}
    className="-mx-1 flex min-h-9 min-w-0 items-center gap-1.5 rounded px-1 text-left text-sm hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-text-link)]">
    <CautionMark scope={first.scope} />
    <span className={`shrink-0 ${confirmed ? 'font-semibold' : 'text-[var(--color-text-secondary)]'}`}>{FLOAT_CAUTION_LABELS[first.scope]}:</span>
    <span className={`min-w-0 truncate ${confirmed ? 'font-medium' : ''}`}>{first.summary}</span>
    {items.length > 1 && <span className="shrink-0 text-[var(--color-text-secondary)]">+{items.length - 1}</span>}
    <span className="sr-only">. Show all cautions in route details.</span>
  </button>;
}

function DetailGroup({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return <section id={id} tabIndex={id ? -1 : undefined} aria-label={title}
    className="space-y-1.5 border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0 focus:outline-none">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h4>
    {children}
  </section>;
}

const FACILITY_ICONS = { camping: 'campground', restrooms: 'facilities', parking: 'parking' } as const;

function EndpointRow({ role, end, facts }: { role: string; end: FloatSearchOption['putIn']; facts?: FloatEndpointFacts }) {
  const fee = facts?.feeRequired === false ? 'No fee' : facts?.feeRequired === true ? 'Fee' : null;
  return <li className="space-y-1">
    <p><span className="text-[var(--color-text-muted)]">{role} · </span><span className="font-medium text-[var(--color-text-primary)]">{end.name}</span></p>
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {end.isPublic === false
        ? <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-accent-900)]"><Lock size={12} aria-hidden="true" />Private: permission required</span>
        : <span>{publicAccessLabel(end.isPublic)}</span>}
      {facts?.facilities.map(facility => <span key={facility} className="inline-flex items-center gap-1">
        <EddyIcon name={FACILITY_ICONS[facility]} size={16} />{FLOAT_FACILITY_LABELS[facility]}
      </span>)}
      {fee && <span>{fee}</span>}
    </p>
  </li>;
}

function stopNote(stop: FloatStop) {
  if (stop.kind !== 'access' && stop.kind !== 'campground') return null;
  return stop.isPublic === false ? 'private: permission required' : stop.isPublic == null ? 'access status unknown' : null;
}

const formatMile = (mile: number) => (Number.isInteger(mile) ? String(mile) : mile.toFixed(1));

/** The long form, grouped: cautions, each end, stops by mile, outfitters, the route's own description. */
export function RouteDetails({ option: o, cautionsId, photoCaption }: { option: FloatSearchOption; cautionsId: string; photoCaption: string | null }) {
  const cautions = routeCautionItems(o);
  const outfitters = o.outfitters ?? [];
  return <div className="space-y-3 rounded-lg bg-[var(--color-surface-hover)] p-3 text-sm text-[var(--color-text-secondary)]">
    {cautions.length > 0 && <DetailGroup title="Cautions" id={cautionsId}>
      <ul className="space-y-1.5">
        {cautions.map((caution, i) => <li key={i} className="flex gap-1.5">
          <CautionMark scope={caution.scope} size={16} />
          <span><span className="font-semibold text-[var(--color-text-primary)]">{FLOAT_CAUTION_LABELS[caution.scope]}: </span>{caution.detail}</span>
        </li>)}
      </ul>
    </DetailGroup>}
    <DetailGroup title="Access">
      <ul className="space-y-2">
        <EndpointRow role="Put-in" end={o.putIn} facts={o.endpointFacts?.putIn} />
        <EndpointRow role="Take-out" end={o.takeOut} facts={o.endpointFacts?.takeOut} />
      </ul>
    </DetailGroup>
    {o.along && o.along.length > 0 && <DetailGroup title="Along the way">
      <ul className="space-y-0.5">
        {o.along.map((stop, i) => {
          const note = stopNote(stop);
          return <li key={`${stop.kind}-${i}`} className="tabular-nums">
            <span className="text-[var(--color-text-muted)]">mi {formatMile(stop.mile)} · </span>
            <span className={stop.kind === 'portage' || stop.kind === 'hazard' ? 'font-semibold text-[var(--color-text-primary)]' : ''}>{stop.name}</span>
            {` · ${FLOAT_STOP_LABELS[stop.kind]}`}
            {note && <span className={stop.isPublic === false ? 'font-semibold text-[var(--color-accent-900)]' : ''}> ({note})</span>}
          </li>;
        })}
      </ul>
    </DetailGroup>}
    {outfitters.length > 0 && <DetailGroup title="Outfitters">
      <ul className="space-y-1.5">
        {outfitters.map(outfitter => <li key={outfitter.id}>
          {outfitter.website
            ? <a href={outfitter.website} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-text-link)] hover:underline"
              onClick={() => trackEvent('outfitter_tap', { river: o.riverSlug, name: outfitter.name, action: 'website', surface: 'find_float' })}>{outfitter.name}</a>
            : <span className="font-medium text-[var(--color-text-primary)]">{outfitter.name}</span>}
          <span> · {outfitterServiceLabel(outfitter.offers)}</span>
          {outfitter.phone && <> · <a className="text-[var(--color-text-link)]" href={`tel:${outfitter.phone.replace(/[^+\d]/g, '')}`}
            onClick={() => trackEvent('outfitter_tap', { river: o.riverSlug, name: outfitter.name, action: 'call', surface: 'find_float' })}>{outfitter.phone}</a></>}
          <br /><span className="text-xs">{FLOAT_OUTFITTER_MATCH_LABELS[outfitter.match]}</span>
        </li>)}
      </ul>
      <p className="text-xs">Directory listings, not live availability. Call ahead.</p>
    </DetailGroup>}
    {o.description && <DetailGroup title="About this float"><p>{o.description}</p></DetailGroup>}
    <p className="text-xs">{o.estimateBasis === 'current_conditions' ? 'Estimate uses current conditions.' : 'Estimate uses typical conditions.'}
      {o.observedAt && o.estimateBasis === 'current_conditions' ? ` Reading ${new Date(o.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}
      {photoCaption ? ` Photo: ${photoCaption}.` : ''}</p>
  </div>;
}
