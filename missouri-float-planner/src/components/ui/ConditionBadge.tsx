// src/components/ui/ConditionBadge.tsx
// The single approved way to render a river-condition pill.
//
// Colors are derived ONLY from the canonical condition system
// (shared/condition-system.ts): a light tint background + accessible dark ink +
// a mid-tint border. This guarantees:
//   - one learnable hue per level (high = orange, dangerous = red — never both red)
//   - WCAG 2.2 AA contrast (no white text on light fills)
//   - a redundant TEXT label so meaning never rests on color alone
// Do NOT hand-roll condition badges elsewhere; use this component.

import { conditionChip } from '@shared/condition-system';

type Size = 'sm' | 'md';

interface ConditionBadgeProps {
  code: string;
  /** Override the label text (defaults to the canonical short label). */
  label?: string;
  size?: Size;
  /** Show a leading status dot (shape redundancy). Default true. */
  showDot?: boolean;
  /** Render the label uppercase. Default false. */
  uppercase?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  // Floor at 12px (text-xs) — never smaller for a safety signal.
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
};

export default function ConditionBadge({
  code,
  label,
  size = 'sm',
  showDot = true,
  uppercase = false,
  className = '',
}: ConditionBadgeProps) {
  const chip = conditionChip(code);
  const text = label ?? chip.label;

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${SIZE_CLASSES[size]} ${
        uppercase ? 'uppercase tracking-wide' : ''
      } ${className}`}
      style={{
        backgroundColor: chip.background,
        color: chip.color,
        borderColor: chip.borderColor,
      }}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full flex-shrink-0 border"
          style={{ backgroundColor: chip.solid, borderColor: chip.color }}
        />
      )}
      {text}
    </span>
  );
}
