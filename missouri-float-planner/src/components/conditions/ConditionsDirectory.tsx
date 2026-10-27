import Link from 'next/link';
import type { ConditionsDestination } from '@/lib/conditions/directory';

/** Keep the full catalogue reachable in the initial HTML beyond the previews. */
export default function ConditionsDirectory({ destinations }: { destinations: ConditionsDestination[] }) {
  if (!destinations.length) return null;
  const alphabetical = [...destinations].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return <section aria-label="A–Z directory" className="border-t border-neutral-200 pt-6">
    <h2 className="mb-3 text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>A–Z directory</h2>
    <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      {alphabetical.map(destination => <li key={destination.key}>
        <Link href={destination.href} prefetch={false} className="inline-flex min-h-11 items-center py-2 text-sm text-primary-800 underline decoration-primary-300 underline-offset-4 hover:decoration-primary-800 focus-visible:outline-2 focus-visible:outline-primary-600">{destination.name}</Link>
      </li>)}
    </ul>
  </section>;
}
