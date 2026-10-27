import Link from 'next/link';
import type { SiteNavLink } from '@/lib/navigation/site-navigation';

/** Page links styled as tabs: normal Tab/Enter behavior, no menu or tab widget. */
export default function SectionNavigation({ label, links }: { label: string; links: SiteNavLink[] }) {
  return (
    <nav aria-label={label} data-ga-navigation="section" className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-stretch gap-1 px-4">
        {links.map(link => (
          <Link
            key={link.label}
            href={link.href}
            aria-current={link.active ? 'page' : undefined}
            className={`inline-flex items-center border-b-2 px-3 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
              link.active ? 'border-primary-600 text-primary-800' : 'border-transparent text-neutral-600 hover:border-neutral-300 hover:text-primary-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
