// src/lib/utils/cx.ts
// Join class names, dropping the falsy ones. That is the whole helper: no
// tailwind-merge, no dedupe, no dependency.
//
// The primitives in src/components/ui put their own class first and the
// caller's `className` last. That order does NOT let a caller override the
// primitive's padding or colour with a utility: the .btn-* / .card-* rules in
// globals.css are declared after @tailwind utilities, so at equal specificity
// they win. A className is for layout around the thing (margin, width,
// alignment). If you need a different box or colour, you need a variant —
// which is the point.

export type ClassValue = string | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
