// Route facts for Find a Float. Time and condition labels are shared with
// the river strip; access, facilities, outfitters and cautions sit on the card.
//
// The card leads with pictures, not prose: Eddy's own icons say what is at the
// ends and along the way, and the words are kept to names and counts. Every
// icon carries its label for screen readers and a hover label for pointers.

import { Lock } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import { trackEvent } from '@/lib/analytics';
import {
  FLOAT_FACILITY_LABELS, FLOAT_OFFER_LABELS, floatRangeLabel, floatStopGroups, privateAccessNote,
  type FloatFacility, type FloatSearchOption, type FloatStopKind,
} from '@shared/float-search';

/** InfoTip colours shared by the cards and the river strip. */
export const INFO_COLORS = {
  trigger: 'var(--color-text-link)', triggerBorder: 'var(--color-border-strong)',
  popBg: 'var(--color-surface)', popBorder: 'var(--color-text-link)', title: 'var(--color-text-primary)',
  body: 'var(--color-text-secondary)', focus: 'var(--color-text-link)',
};

export function routeAccessLabel(o: FloatSearchOption) {
  return o.putIn.isPublic === true && o.takeOut.isPublic === true ? 'Public access'
    : o.putIn.isPublic === false || o.takeOut.isPublic === false ? 'Includes private access' : 'Access unconfirmed';
}

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

/** Full caution text, for route details. */
export function RouteCautions({ option: o }: { option: FloatSearchOption }) {
  return <>
    {o.conditional && !o.cautions.length && <p className="text-sm font-medium">Check route cautions before going.</p>}
    {o.cautions.map((caution, i) => <p className="text-sm font-medium" key={i}>{caution}</p>)}
  </>;
}

/**
 * One line on the card: the hazard mark and the first caution's headline. The
 * cue stays visible; the full wording is a tap away in route details.
 */
export function RouteCautionLine({ option: o }: { option: FloatSearchOption }) {
  if (!routeCautionsPresent(o)) return null;
  const first = o.cautions[0];
  // Notices read "Headline: explanation"; the headline is the part worth a line.
  const headline = first ? first.split(/:\s/)[0] : 'Check route cautions before going.';
  const more = o.cautions.length > 1 ? o.cautions.length - 1 : 0;
  return <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium" title={o.cautions.join('\n') || undefined}>
    <EddyIcon name="hazard" size={18} />
    <span className="sr-only">Caution: </span>
    <span className="min-w-0 truncate">{headline}</span>
    {more > 0 && <span className="shrink-0 text-[var(--color-text-secondary)]">+{more}</span>}
  </p>;
}

/** An icon whose meaning is its label: read aloud, and shown as a tooltip on hover. */
export function IconFact({ icon, label, size = 20 }: { icon: EddyIconName; label: string; size?: number }) {
  return <span className="inline-flex items-center" title={label}>
    <EddyIcon name={icon} size={size} />
    <span className="sr-only">{label}</span>
  </span>;
}

const FACILITY_ICONS: Record<Exclude<FloatFacility, 'noFees'>, EddyIconName> = {
  camping: 'campground',
  restrooms: 'facilities',
  parking: 'parking',
};

/**
 * Access and facilities as one row of marks. Private access is the one fact
 * spelled out, because it decides whether the float can happen at all.
 */
export function RouteFacilities({ option: o }: { option: FloatSearchOption }) {
  const privateNote = privateAccessNote(o);
  const allPublic = o.putIn.isPublic === true && o.takeOut.isPublic === true;
  // Payloads from before `facilities` existed still carry the text highlights.
  if (!o.facilities) {
    return <span className="text-[var(--color-text-secondary)]">{[routeAccessLabel(o), ...(o.highlights ?? [])].join(' · ')}</span>;
  }
  return <ul className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Access and facilities">
    {allPublic && <li><IconFact icon="boatRamp" label="Public put-in and take-out" /></li>}
    {o.facilities.map(facility => facility === 'noFees'
      ? <li key={facility} className="text-xs font-semibold text-[var(--color-text-secondary)]">{FLOAT_FACILITY_LABELS.noFees}</li>
      : <li key={facility}><IconFact icon={FACILITY_ICONS[facility]} label={FLOAT_FACILITY_LABELS[facility]} /></li>)}
    {privateNote
      ? <li className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent-300)] bg-[var(--color-accent-50)] px-2 py-0.5 text-xs font-semibold text-[var(--color-accent-900)]" title={privateNote}>
        <Lock size={12} aria-hidden="true" />{privateNote.split(':')[0]}<span className="sr-only">: permission required</span>
      </li>
      : !allPublic && <li className="text-xs text-[var(--color-text-secondary)]">Access unconfirmed</li>}
  </ul>;
}

const STOP_ICONS: Record<FloatStopKind, EddyIconName> = {
  portage: 'hazard',
  hazard: 'hazard',
  access: 'boatRamp',
  campground: 'campground',
  spring: 'spring',
  cave: 'accessPoint',
  sight: 'accessPoint',
};

/** What lies between the ends, grouped into one row: "⚠ 1 portage · ⛵ 3 accesses · 💧 Big Spring". */
export function RouteAlong({ option: o }: { option: FloatSearchOption }) {
  const groups = floatStopGroups(o.along);
  if (!groups.length) return null;
  return <div className="flex min-w-0 items-center gap-2 text-xs">
    <span className="shrink-0 font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Along</span>
    <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" aria-label="Along the way">
      {groups.map(group => <li key={group.kind} title={group.detail} className={`inline-flex min-w-0 items-center gap-1 ${group.kind === 'portage' || group.kind === 'hazard' ? 'font-semibold' : 'text-[var(--color-text-secondary)]'}`}>
        <EddyIcon name={STOP_ICONS[group.kind]} size={18} />
        <span className="max-w-[9rem] truncate">{group.label}</span>
      </li>)}
    </ul>
  </div>;
}

/**
 * The most relevant outfitter by name, linked when it has a site, and how many
 * more. What they offer is reduced to the two things a floater decides on; the
 * full list, with phone numbers, is in route details.
 */
export function RouteOutfitters({ option: o }: { option: FloatSearchOption }) {
  const outfitters = o.outfitters ?? [];
  if (!outfitters.length) return null;
  const [lead] = outfitters;
  const offers = new Set(outfitters.flatMap(outfitter => outfitter.offers));
  const summary = [offers.has('shuttle') && 'Shuttle', [...offers].some(offer => offer !== 'shuttle') && 'Rentals'].filter(Boolean).join(' · ');
  return <div className="flex min-w-0 items-center gap-2 text-sm" title={outfitters.map(outfitter => `${outfitter.name}: ${outfitter.offers.map(offer => FLOAT_OFFER_LABELS[offer]).join(', ')}`).join('\n')}>
    <EddyIcon name="outfitter" size={20} />
    <span className="sr-only">Outfitters:</span>
    <span className="min-w-0 truncate">
      {lead.website
        ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-text-link)] hover:underline"
          onClick={() => trackEvent('outfitter_tap', { river: o.riverSlug, name: lead.name, action: 'website', surface: 'find_float' })}>{lead.name}</a>
        : <span className="font-medium">{lead.name}</span>}
    </span>
    {outfitters.length > 1 && <span className="shrink-0 text-[var(--color-text-secondary)]">+{outfitters.length - 1}<span className="sr-only"> more in route details</span></span>}
    {summary && <span className="ml-auto shrink-0 pl-1 text-xs text-[var(--color-text-secondary)]">{summary}</span>}
  </div>;
}
