// src/components/river/RiverAlertsPanel.tsx
// What the agencies have posted about this river — closures and warnings.
//
// ── Not a condition ────────────────────────────────────────────────────────
// Everything here is somebody else's verdict, relayed. The Park Service closes
// a campground; the Weather Service issues a flood warning. Eddy's own reading
// of the water lives in the section below this one, and the two must not be
// mistakable for one another — which is why this panel borrows nothing from
// CONDITION_COLORS and names its source on every row.
//
// ── Server-rendered, no client island ──────────────────────────────────────
// The alerts are fetched in page.tsx alongside the dam and the reaches, so this
// is a pure presentational component. It also means the section is in the
// initial HTML: a closure is exactly the thing that should not wait on
// hydration, and it is the thing a crawler should see.

import { AlertTriangle, ExternalLink, Info, Ban, ChevronDown } from 'lucide-react';
import type { RiverAlert, RiverAlertSeverity } from '@/types/api';

/**
 * Three looks for three levels, and none of them is a condition colour.
 *
 * Red is reserved for `warning`, which is the only level either agency uses to
 * mean "this is happening and it is dangerous". A closure is amber: it stops
 * the trip without being a hazard. Anything unrecognised arrives as `notice`
 * and is drawn as plain information — see the severity mapping in the route,
 * which floors unknown categories rather than promoting them.
 */
const STYLES: Record<
  RiverAlertSeverity,
  { wrap: string; icon: typeof AlertTriangle; iconClass: string }
> = {
  warning: {
    wrap: 'border-red-300 bg-red-50 text-red-950',
    icon: AlertTriangle,
    iconClass: 'text-red-600',
  },
  watch: {
    wrap: 'border-amber-300 bg-amber-50 text-amber-950',
    icon: Ban,
    iconClass: 'text-amber-600',
  },
  notice: {
    wrap: 'border-neutral-300 bg-neutral-50 text-neutral-800',
    icon: Info,
    iconClass: 'text-neutral-500',
  },
};

const SOURCE_LABEL: Record<RiverAlert['source'], string> = {
  nps: 'National Park Service',
  nws: 'National Weather Service',
};

export default function RiverAlertsPanel({ alerts }: { alerts: RiverAlert[] }) {
  // The caller gates the whole <section> on this too, so reaching here with an
  // empty list means the page wanted a heading it cannot fill. Render nothing
  // rather than an empty card — "no alerts" is not a claim this panel is in a
  // position to make, since it cannot tell an all-clear from an outage.
  if (alerts.length === 0) return null;

  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;
  const summarySeverity: RiverAlertSeverity = warningCount
    ? 'warning'
    : alerts.some((alert) => alert.severity === 'watch')
      ? 'watch'
      : 'notice';
  const summaryStyle = STYLES[summarySeverity];
  const SummaryIcon = summaryStyle.icon;
  const summary = `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'}${
    warningCount ? ` · ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}` : ''
  }`;

  return (
    <details className="group" open={warningCount > 0}>
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden ${summaryStyle.wrap}`}
      >
        <SummaryIcon className={`h-4 w-4 ${summaryStyle.iconClass}`} aria-hidden="true" />
        <span className="flex-1">{summary}</span>
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 space-y-2">
      {alerts.map((alert) => {
        const style = STYLES[alert.severity];
        const Icon = style.icon;
        return (
          <div
            key={alert.id}
            // `alert` only for the loud ones. Every warning on the page firing
            // an assertive announcement would talk over a screen reader working
            // through an ordinary park notice.
            role={alert.severity === 'warning' ? 'alert' : 'note'}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${style.wrap}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{alert.title}</p>
              {alert.body ? (
                // Clamped, not truncated server-side: the NWS ships several
                // hundred words of hydrology and the reader wants the first
                // sentence. The full text is behind the link where there is one.
                <p className="mt-0.5 line-clamp-3 leading-relaxed opacity-90">{alert.body}</p>
              ) : null}
              {/* WHO SAID IT, on every row. This is the line that keeps a
                  relayed closure from reading as an Eddy verdict. */}
              <p className="mt-1 text-xs font-medium opacity-70">
                {alert.category} · {SOURCE_LABEL[alert.source]}
              </p>
              {alert.url ? (
                <a
                  href={alert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2"
                >
                  Read it on {alert.source === 'nps' ? 'nps.gov' : 'weather.gov'}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
      </div>
    </details>
  );
}
