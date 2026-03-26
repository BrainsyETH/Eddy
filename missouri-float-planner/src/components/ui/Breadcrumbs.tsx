'use client';

// src/components/ui/Breadcrumbs.tsx
// Reusable breadcrumb navigation with schema.org BreadcrumbList markup

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 text-sm text-neutral-500 flex-wrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" aria-hidden="true" />}
              {isLast || !item.href ? (
                <span className={isLast ? 'text-neutral-900 font-medium truncate max-w-[200px]' : ''}>
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-neutral-900 transition-colors no-underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* schema.org BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: items
              .filter((item) => item.href || items.indexOf(item) === items.length - 1)
              .map((item, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: item.label,
                ...(item.href ? { item: `https://eddy.guide${item.href}` } : {}),
              })),
          }),
        }}
      />
    </nav>
  );
}
