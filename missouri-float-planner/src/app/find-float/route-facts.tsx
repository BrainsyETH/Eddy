// Route facts for Find a Float. Time and condition labels are shared with
// the river strip; access details and cautions stay on the full route card.

import ConditionBadge from '@/components/ui/ConditionBadge';
import { floatRangeLabel, type FloatSearchOption } from '@shared/float-search';

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

export function RouteCautions({ option: o }: { option: FloatSearchOption }) {
  return <>
    {o.conditional && !o.cautions.length && <p className="text-sm font-medium">Check route cautions before going.</p>}
    {o.cautions.map((caution, i) => <p className="text-sm font-medium" key={i}>{caution}</p>)}
  </>;
}
