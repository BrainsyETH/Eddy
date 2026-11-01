// Facts about one Find a Float route, worded once for every place that shows
// them: the route card and the river strip's selected-float bar. A fact added
// to a card belongs here so the bar cannot fall behind it.

import ConditionBadge from '@/components/ui/ConditionBadge';
import { floatRangeLabel, type FloatSearchOption } from '@shared/float-search';

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
