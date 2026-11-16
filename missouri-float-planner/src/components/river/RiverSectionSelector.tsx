'use client';

import { reachAnchorId, riverSectionLabel, type RiverReportSection } from '@/lib/river-report-sections';

export default function RiverSectionSelector({
  sections,
  selectedSlug,
  onChange,
}: {
  sections: RiverReportSection[];
  selectedSlug: string | null;
  onChange: (slug: string) => void;
}) {
  return (
    <fieldset id="reaches" className="mb-5 min-w-0 scroll-mt-28">
      <legend className="mb-2 text-sm font-semibold text-neutral-800">Choose your section</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {sections.map((section) => {
          const { title, subtitle } = riverSectionLabel(section);
          const selected = section.sectionSlug === selectedSlug;
          return (
            <label
              key={section.sectionSlug}
              id={reachAnchorId(section.sectionSlug)}
              className={`flex min-h-[72px] min-w-0 cursor-pointer scroll-mt-28 items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-600 ${selected ? 'border-primary-600 bg-primary-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}
            >
              <input
                type="radio"
                name="river-section"
                value={section.sectionSlug}
                checked={selected}
                onChange={() => onChange(section.sectionSlug)}
                className="h-4 w-4 shrink-0 accent-primary-700"
                aria-controls="river-section-report"
              />
              <span className="min-w-0">
                <span className="block font-heading text-base font-bold leading-snug text-neutral-900">{title}</span>
                {subtitle && <span className="mt-0.5 block text-sm leading-snug text-neutral-600">{subtitle}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
