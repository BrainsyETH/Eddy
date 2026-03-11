// src/app/guides/page.tsx
// Guides index page — entry point for all curated content

import Link from 'next/link';
import type { Metadata } from 'next';
import { Compass, MapPin, CheckSquare, Sun, Building2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Float Trip Guides | Eddy',
  description: 'Curated guides to help you plan the perfect Ozark float trip — best floats, packing checklists, outfitter tips, and more.',
};

const guides = [
  {
    href: '/guides/best-floats',
    icon: Compass,
    title: 'Best Float Trips',
    description: 'Curated recommendations for every type of floater — beginners, families, solitude seekers, and more.',
    color: 'bg-accent-50 text-accent-600',
  },
  {
    href: '/guides/checklist',
    icon: CheckSquare,
    title: 'Float Trip Checklist',
    description: 'Everything you need to pack for a day float or overnight camping trip on the river.',
    color: 'bg-support-50 text-support-600',
  },
];

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <section className="py-12 md:py-16" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Compass className="w-10 h-10 text-accent-500 mx-auto mb-3" />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Float Trip Guides
          </h1>
          <p className="text-lg text-white/80">
            Local knowledge to help you plan the perfect Ozark adventure
          </p>
        </div>
      </section>

      {/* Guide Cards */}
      <section className="max-w-4xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {guides.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="group bg-white rounded-xl border-2 border-neutral-200 hover:border-primary-300 p-6 transition-all hover:shadow-soft-md no-underline"
            >
              <div className={`inline-flex p-3 rounded-lg ${guide.color} mb-4`}>
                <guide.icon className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 group-hover:text-primary-700 transition-colors mb-2">
                {guide.title}
              </h2>
              <p className="text-sm text-neutral-600">
                {guide.description}
              </p>
            </Link>
          ))}
        </div>

        {/* Coming Soon callout */}
        <div className="mt-10 p-6 bg-neutral-100 rounded-xl border border-neutral-200 text-center">
          <p className="text-sm text-neutral-600">
            More guides coming soon — outfitter directories, lodging guides, seasonal calendars, and more.
          </p>
        </div>
      </section>
    </div>
  );
}
