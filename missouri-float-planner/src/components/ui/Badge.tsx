// src/components/ui/Badge.tsx
// A small tinted label: a category, a count, a status that is NOT a river
// condition. Wraps .badge and the .badge-<tone> classes in globals.css.
//
// For a river condition use ConditionBadge. Its colours come from
// shared/condition-system.ts, the same source the iOS app draws from, and a
// condition rendered any other way is a second opinion about safety.

import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/utils/cx';

export type BadgeTone = 'primary' | 'accent' | 'support' | 'secondary' | 'neutral';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'children'> {
  tone?: BadgeTone;
  className?: string;
  children?: ReactNode;
}

export default function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}
