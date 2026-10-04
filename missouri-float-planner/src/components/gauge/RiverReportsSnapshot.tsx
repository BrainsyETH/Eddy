import Link from 'next/link';
import type { RiverListItem } from '@/types/api';
import { riverPath } from '@/lib/navigation/river-path';

/** Real river content in the initial HTML, and a useful fallback if live gauges fail. */
export default function RiverReportsSnapshot({ rivers, unavailable = false }: {
  rivers: RiverListItem[];
  unavailable?: boolean;
}) {
  return (
    <section aria-label="River directory">
      {unavailable && <p role="status" className="mb-4 text-sm text-neutral-600">Live charts couldn’t load. You can still open a river report below.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rivers.map(river => (
          <article key={river.id} className="bg-white rounded-xl border border-neutral-200 p-5">
            <h2 className="text-lg font-bold text-neutral-900">
              <Link href={river.path || riverPath(river.state, river.slug)} className="hover:underline">{river.name}</Link>
            </h2>
            <p className="mt-1 text-sm text-neutral-600">{[river.state, river.lengthMiles ? `${river.lengthMiles} river miles` : null, river.difficultyRating].filter(Boolean).join(' · ')}</p>
            {river.description && <p className="mt-3 text-sm text-neutral-700 line-clamp-3">{river.description}</p>}
            <Link href={river.path || riverPath(river.state, river.slug)} className="inline-block mt-4 text-sm font-semibold text-primary-700 hover:underline">View conditions and access points →</Link>
          </article>
        ))}
      </div>
      {rivers.length === 0 && <p className="text-neutral-600">River reports are temporarily unavailable. Please try again shortly.</p>}
    </section>
  );
}
