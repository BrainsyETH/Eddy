/** A failed lookup is distinct from a successful, empty result. */
export default function PlanHazardStatus({ unavailable }: { unavailable?: boolean }) {
  if (!unavailable) return null;
  return <p className="text-sm text-neutral-500">Hazard information couldn’t be loaded.</p>;
}
