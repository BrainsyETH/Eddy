import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { levelChangeLabel } from '@shared/lake-status';

export default function LakeMovement({ delta, hours }: { delta?: number; hours: number }) {
  const label = levelChangeLabel(delta ?? null, hours);
  if (!label || delta === undefined) return null;
  const unchanged = Math.abs(delta) < 0.05;
  const Icon = unchanged ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
  return <span className={`inline-flex items-center gap-1 text-sm font-semibold ${unchanged ? 'text-neutral-600' : delta > 0 ? 'text-accent-800' : 'text-primary-700'}`}>
    <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
  </span>;
}
