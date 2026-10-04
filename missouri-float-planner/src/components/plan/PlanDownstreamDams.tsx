import { damBelowTakeOutLabel, type DamBelowTakeOut } from '@shared/route-hazards';

export default function PlanDownstreamDams({ dams }: { dams?: DamBelowTakeOut[] }) {
  if (!dams?.length) return null;
  return (
    <section className="mt-3 rounded-xl border border-amber-500 bg-amber-50 p-3" aria-label="Below your take-out">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Below your take-out</p>
      <ul className="mt-1 space-y-1 text-sm text-amber-800">
        {dams.map(dam => <li key={dam.id}><span className="font-bold">{dam.name}</span> · {damBelowTakeOutLabel(dam)}</li>)}
      </ul>
    </section>
  );
}
