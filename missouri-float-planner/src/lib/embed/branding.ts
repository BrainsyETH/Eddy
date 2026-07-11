// src/lib/embed/branding.ts
// Client-safe helpers shared by the embed widgets.
//
// Every outbound link from a widget back to eddy.guide carries UTM params so
// widget-driven traffic is attributable per widget type and per river/embed
// in analytics. The card widget established the convention
// (utm_source=eddy_embed, utm_medium=<widget>, utm_campaign=<key>); this
// helper extends it to all widgets, with the partner/embed identity riding
// along in utm_content.

export const UTM_SOURCE = 'eddy_embed';

export interface EddyDeepLinkOpts {
  /** Widget type for utm_medium, e.g. 'widget', 'badge', 'planner'. */
  widget: string;
  /** River slug or embed id for utm_campaign. */
  key: string;
  /** Optional partner name or embed id for utm_content. */
  partner?: string | null;
}

/**
 * Build an eddy.guide deep link with embed UTM attribution. Preserves any
 * query params already present in `path` (e.g. /plan?river=current).
 */
export function eddyDeepLink(origin: string, path: string, opts: EddyDeepLinkOpts): string {
  try {
    const url = new URL(path, origin);
    url.searchParams.set('utm_source', UTM_SOURCE);
    url.searchParams.set('utm_medium', opts.widget);
    url.searchParams.set('utm_campaign', opts.key || 'none');
    if (opts.partner) url.searchParams.set('utm_content', opts.partner.slice(0, 60));
    return url.toString();
  } catch {
    // A malformed path should never break the widget — fall back untagged.
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

// Branding payload returned by GET /api/embed/widgets/[embedId] — the
// registration-based co-branding shared by all widgets (never includes the
// business address or location).
export interface EmbedBranding {
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  siteUrl: string | null;
}
