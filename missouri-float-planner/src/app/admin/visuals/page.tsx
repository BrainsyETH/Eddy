import type { Metadata } from 'next';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { VISUAL_GUIDES } from '@/lib/admin/visual-guides';

const groups = [...new Set(VISUAL_GUIDES.map((guide) => guide.group))];

export const metadata: Metadata = { title: 'Visual guides | Admin' };

export default function VisualGuidesPage() {
  return (
    <AdminLayout
      title="Visual guides"
      description="Get to know how Eddy works, one interactive example at a time."
    >
      <div className="mx-auto max-w-6xl space-y-10 p-4 sm:p-6 lg:p-8">
        <div className="flex items-start gap-4 rounded-xl border border-teal-800 bg-teal-950/40 p-5">
          <BookOpen className="mt-1 h-6 w-6 shrink-0 text-teal-300" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-white">Start anywhere. Explore at your own pace.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">
              Choose a guide, then try its controls to see what changes. These
              are examples and prototypes, with simulated data. They do not
              change live settings or publish anything.
            </p>
          </div>
        </div>

        {groups.map((group, index) => (
          <section key={group} aria-labelledby={`guide-group-${index}`}>
            <h2 id={`guide-group-${index}`} className="mb-4 text-lg font-semibold text-white">
              {group}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {VISUAL_GUIDES.filter((guide) => guide.group === group).map((guide) => (
                // Native navigation: these protected routes return standalone
                // HTML documents, not React Server Component payloads.
                <a
                  key={guide.file}
                  href={`/admin/visuals/${guide.file}`}
                  className="group flex flex-col rounded-xl border border-neutral-700 bg-neutral-800 p-5 transition-colors hover:border-teal-400 hover:bg-neutral-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-900"
                >
                  <h3 className="text-base font-semibold text-white">{guide.title}</h3>
                  <p className="mb-6 mt-2 text-sm leading-relaxed text-neutral-300">{guide.description}</p>
                  <span className="mt-auto flex items-center gap-2 text-sm font-medium text-teal-300">
                    Explore guide
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
