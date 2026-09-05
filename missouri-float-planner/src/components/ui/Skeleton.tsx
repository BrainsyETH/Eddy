// src/components/ui/Skeleton.tsx
// A loading placeholder in the shape of the thing that is coming.
//
// Size it with the same classes the real element uses (h-7 w-48, rounded-xl).
// A skeleton that matches the final layout feels faster and is honest about
// what is loading; one that does not causes a layout jump when the data lands,
// which is worse than a spinner would have been.
//
// The sweep is on the block itself, never on a parent. An opacity animation on
// a container also fades any real content already inside it — RiverGaugeDetail
// had a tailwater row, real data, pulsing along with the placeholders until
// the gauge query settled. Reduced motion turns the sweep off globally
// (globals.css, MOTION PREFERENCES).
//
// Mark the container that holds a group of these `aria-busy="true"`; each
// block is aria-hidden, so the group, not the blocks, is what a screen
// reader hears about.

import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/utils/cx';

type Rounded = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const ROUNDED_CLASS: Record<Rounded, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'> {
  /** Match the real element's corner. Default is the 4px block. */
  rounded?: Rounded;
  className?: string;
}

export default function Skeleton({ rounded = 'sm', className, ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={cx('skeleton', ROUNDED_CLASS[rounded], className)} {...rest} />;
}
