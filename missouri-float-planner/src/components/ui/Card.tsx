// src/components/ui/Card.tsx
// The one way to render a card surface on the website.
//
// Wraps the card classes in globals.css. Pick the variant by what the content
// is, not by taste:
//   standard   the brutalist card DESIGN.md §4 leads with — 2px teal border,
//              offset shadow, hover lift. River tiles, feature cards.
//   panel      the quiet data surface most of the site actually uses — one
//              hairline border, no shadow, no lift. Chart shells, threshold
//              tables, notices. Unpadded; panels carry their own header rows.
//   trip       the tan trip summary.
//   access     an access-point row.
//   glass      map overlays, light and dark.
//
// `as` picks the element. A card that is a landmark (a region with its own
// aria-label) should be a <section>; a card that is just a box stays a <div>.

import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/utils/cx';

export type CardVariant = 'standard' | 'panel' | 'trip' | 'access' | 'glass' | 'glass-dark';

const VARIANT_CLASS: Record<CardVariant, string> = {
  standard: 'card',
  panel: 'card-panel',
  trip: 'trip-card',
  access: 'access-card',
  glass: 'glass-card',
  'glass-dark': 'glass-card-dark',
};

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> {
  variant?: CardVariant;
  as?: 'div' | 'section' | 'article' | 'aside';
  className?: string;
  children?: ReactNode;
}

export default function Card({ variant = 'standard', as = 'div', className, children, ...rest }: CardProps) {
  const Tag: ElementType = as;
  return (
    <Tag className={cx(VARIANT_CLASS[variant], className)} {...rest}>
      {children}
    </Tag>
  );
}
