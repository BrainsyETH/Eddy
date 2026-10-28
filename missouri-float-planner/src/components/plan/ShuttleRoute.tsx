import type { FloatPlan } from '@/types/api';
import AccessPointNav from '@/components/access-point/AccessPointNav';

export default function ShuttleRoute({ plan }: { plan: Pick<FloatPlan, 'putIn' | 'takeOut'> }) {
  return (
    <section aria-label="Shuttle Route" className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-primary-700">Shuttle Route</h3>
        <AccessPointNav accessPoint={plan.takeOut} origin={plan.putIn} compact />
      </div>
      <p className="text-xs text-neutral-500">Directions from point-to-point</p>
    </section>
  );
}
