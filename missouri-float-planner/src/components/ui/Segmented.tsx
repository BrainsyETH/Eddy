// src/components/ui/Segmented.tsx
// A row of mutually exclusive options: ft / cfs, 24H / 7D / 30D.
//
// The most repeated control on the site — 37 aria-pressed buttons across 13
// files, each re-deriving the same five classes — and now one component. The
// pressed look is styled from aria-pressed (globals.css .segmented__option),
// so the accessible state and the visual state are one attribute and cannot
// drift apart.
//
// An option can be disabled with a reason; the reason goes in `title`, so the
// control still explains itself ("needs a rated station"). Disabled options
// stay in the tab order and announce aria-disabled rather than vanishing: a
// range that exists but is unavailable here is a different fact from a range
// that does not exist.

import type { ReactNode } from 'react';
import { cx } from '@/lib/utils/cx';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Tooltip; for a disabled option, the reason it is disabled. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
}

export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx('segmented', size === 'md' && 'segmented--md', className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="segmented__option"
          aria-pressed={option.value === value}
          aria-disabled={option.disabled || undefined}
          title={option.title}
          onClick={() => {
            if (!option.disabled) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
