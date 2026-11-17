import { ExternalLink } from 'lucide-react';
import type { DamSourceLink as SourceLink } from '@shared/dam-types';

/**
 * A link out to the publisher's own page for the data beside it.
 *
 * It sits in the section it sources: the Corps' page under the measured
 * release, SWPA's under the posted schedule. The visible text names the
 * destination; the publisher in full and the new tab are added for screen
 * readers, where "SWPA" alone says little. The mark says the link leaves Eddy.
 *
 * `noreferrer` keeps the reader's Eddy page out of another site's logs. The
 * click is counted through the delegated listener (AnalyticsListener), the
 * same way the gauge page counts its USGS link.
 */
export default function DamSourceLink({ link, className = '' }: { link: SourceLink; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-dam-source={link.kind}
      data-ga-event="dam_source_opened"
      data-ga-label={link.kind}
      className={`inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary-700 underline underline-offset-4 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${className}`}
    >
      {link.label}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">({link.publisher}, opens in a new tab)</span>
    </a>
  );
}
