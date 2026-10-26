import type { GeneratorRack } from '@shared/dam-generation';

/** Decorative flow equivalents, never a count of units actually running. */
export default function DamGeneratorRack({ rack, compact = false, inverse = false }: { rack: GeneratorRack; compact?: boolean; inverse?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-1' : 'gap-1.5'}`} aria-hidden="true">
      {rack.cells.map((cell, i) => {
        const pct = Math.round(cell.fill * 100);
        return (
          <span
            key={i}
            className={`relative inline-block min-w-0 rounded-[3px] border-2 ${inverse ? 'border-primary-200' : 'border-primary-700'} ${compact ? 'h-6 w-3' : 'h-8 w-5'}`}
            style={{ background: `linear-gradient(to top, var(--color-primary-${inverse ? '200' : '700'}) ${pct}%, var(--color-primary-${inverse ? '900' : '50'}) ${pct}%)` }}
          >
            <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-primary-200/70" />
          </span>
        );
      })}
    </div>
  );
}
