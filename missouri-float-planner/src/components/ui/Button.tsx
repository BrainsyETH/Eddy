// src/components/ui/Button.tsx
// The one way to render a button, or a link shaped like one, on the website.
//
// It wraps the .btn-* classes in globals.css, which already carry the hover
// lift, the pressed push, :focus-visible, :disabled, and the motion tokens —
// so anything rendered through here gets every state for free. Before this
// file existed those classes were reached from two files, while 170
// hand-rolled px-/py-/rounded- strings did the same job with none of the
// states and their own timing each.
//
// `href` makes it a Next <Link>; `href` + `external` makes it an <a> with the
// safe rel. Otherwise it is a <button type="button">. type="button" is the
// default on purpose: a bare <button> inside a form submits the form, which
// is never what a "Zoom in" chip means.
//
// Variants are the design system's (DESIGN.md §4) plus `outline`, the
// neutral chip that data surfaces were already using everywhere with no
// class. Sizes adjust the box only.

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '@/lib/utils/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  icon: 'btn-icon',
  outline: 'btn-outline',
};

const SIZE_CLASS: Record<ButtonSize, string | null> = {
  sm: 'btn--sm',
  md: null,
  lg: 'btn--lg',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    href?: undefined;
    external?: undefined;
    ref?: Ref<HTMLButtonElement>;
  };

type AsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    /** Open in a new tab with rel="noopener noreferrer". Off-site links only. */
    external?: boolean;
    ref?: Ref<HTMLAnchorElement>;
  };

export type ButtonProps = AsButton | AsLink;

export default function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className, children, ...rest } = props;
  const classes = cx(VARIANT_CLASS[variant], SIZE_CLASS[size], className);

  if (rest.href !== undefined) {
    const { href, external, ...anchor } = rest;
    if (external) {
      return (
        <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...anchor}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...anchor}>
        {children}
      </Link>
    );
  }

  const { type = 'button', ...button } = rest;
  return (
    <button type={type} className={classes} {...button}>
      {children}
    </button>
  );
}
