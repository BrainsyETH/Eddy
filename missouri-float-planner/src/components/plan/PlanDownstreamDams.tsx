import {
  hazardDistanceLabel,
  type DamBelowTakeOut,
  type HazardAbovePutIn,
} from '@shared/route-hazards';

/** Fixed hazards just outside the route: a danger above the put-in (such as the
 * dam over a tailwater ramp) and low-water dams below the take-out. */
export default function PlanDownstreamDams({ dams, above }: { dams?: DamBelowTakeOut[]; above?: HazardAbovePutIn[] }) {
  return (
    <>
      {above?.length ? (
        <section className="mt-3 rounded-xl border border-amber-500 bg-amber-50 p-3" aria-label="Above your put-in">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Above your put-in</p>
          <ul className="mt-1 space-y-1 text-sm text-amber-800">
            {above.map(hazard => <li key={hazard.id}><span className="font-bold">{hazard.name}</span> · {hazardDistanceLabel(hazard)}</li>)}
          </ul>
        </section>
      ) : null}
      {dams?.length ? (
        <section className="mt-3 rounded-xl border border-amber-500 bg-amber-50 p-3" aria-label="Below your take-out">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Below your take-out</p>
          <ul className="mt-1 space-y-1 text-sm text-amber-800">
            {dams.map(dam => <li key={dam.id}><span className="font-bold">{dam.name}</span> · {hazardDistanceLabel(dam)}</li>)}
          </ul>
        </section>
      ) : null}
    </>
  );
}
