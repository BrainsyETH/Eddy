// eddy-ios/src/lib/share.ts
// Handing someone else a link to what you are looking at.
//
// ── What gets shared is a WEB url, always ───────────────────────────────────
// Never an eddy:// link. The person on the other end of a text message has not
// installed this app — that is most of the point of sending it — and a custom
// scheme lands them on an error page. eddy.guide answers every one of these
// routes, renders server-side, and unfurls with a preview card.
//
// The day universal links exist (ios.associatedDomains + an
// apple-app-site-association file on the website, neither of which is in the
// repo today) these same URLs start reopening the app for people who DO have
// it, with no change here. That is the other reason not to invent a scheme URL:
// the web URL is already the forward-compatible one.
//
// ── The app's routes are not the website's ──────────────────────────────────
// This is the trap the whole file exists to avoid. The app routes to
// /river/<slug>; the website is /rivers/<state>/<slug>. Singular vs plural, and
// a state segment the app has never had. Composing a share URL out of the route
// the user is standing on produces a 404 for every river.
//
// So paths are SERVED, not built: RiverListItem.path and AccessPointDetail.path
// are both the canonical web form, straight from riverPath()/riverAccessPath()
// on the server. The only path composed here is the gauge one, because
// /gauges/<siteId> takes the site number the app already routes by, and the
// website resolves it — to that gauge's river hub when it has one, and to the
// standalone view when it does not.

import { Share } from 'react-native';
import Constants from 'expo-constants';

/**
 * Where the website lives. Same resolution as src/api/client.ts, deliberately —
 * a build pointed at a preview deployment should share preview links rather
 * than silently handing out production ones.
 */
const WEB_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';

/** An absolute eddy.guide URL from a server-supplied path. */
export function webUrl(path: string): string {
  return `${WEB_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The website's page for a station, or null when it has none.
 *
 * The only path this file composes rather than receives, because these two ARE
 * keyed by the id the app already routes by. Which of them applies is decided
 * by the provider, and getting it wrong is silent:
 *
 *   usgs   → /gauges/<siteId>. The website's handler tests the slug against
 *            /^\d+$/ and, for a match, permanently redirects to the primary
 *            river's hub — so a shared curated gauge lands on the page carrying
 *            the verdict, not on a bare number. An uncurated one falls through
 *            to the standalone view. Both are real pages.
 *
 *   usace  → /dams/<damId>. NOTE THE PLURAL: the app routes to /dam/<damId>
 *            and the website to /dams/<damId>. The ids are the same string by
 *            construction (the registry key doubles as site_id_external), so
 *            only the segment differs — which is exactly the kind of near-miss
 *            that produces a 404 nobody notices until a user reports it.
 *
 *   nws    → null. A five-letter LID is neither numeric nor a river slug, so
 *            /gauges/<LID> would take the website's ELSE branch and permanently
 *            redirect to /rivers/<LID>, which does not exist. There is no page
 *            to share, so there is no share button.
 *
 * Anything else returns null on the same principle: a link we cannot show is
 * better than one that lands on a redirect to nowhere.
 */
export function gaugeSharePath(
  provider: string | null | undefined,
  siteId: string | null | undefined
): string | null {
  if (!siteId) return null;
  if (provider === 'usgs') return `/gauges/${encodeURIComponent(siteId)}`;
  if (provider === 'usace') return `/dams/${encodeURIComponent(siteId)}`;
  return null;
}

/**
 * Open the system share sheet.
 *
 * `message` carries the URL as well as the title because iOS drops the `url`
 * field for several targets (SMS and most third-party apps take only text), and
 * a share that arrives as a bare river name with no link is worse than useless.
 * `url` is still passed so the targets that DO honour it — Mail, AirDrop — get
 * a real link object and can render the preview card.
 *
 * Resolves quietly when the user cancels: dismissing a share sheet is not an
 * error and must never produce an alert.
 *
 * ── `note` is OPTIONAL, and every existing caller omits it ─────────────────
 *
 * One line between the title and the link, for callers that have something
 * worth saying about the thing being shared. Omit it and the message is exactly
 * what it has always been — the gauge and access-point screens share this
 * function and their output is unchanged by its existence.
 *
 * What it must NOT carry is the paid report. The river screen passes Eddy's
 * free summary, which is the block the generator writes for "share cards and
 * compact views" and is under 120 characters; the website's EddyQuote falls
 * back from it to the full quote, and this deliberately does not. A share sheet
 * is the one control designed to send things to people who have not paid.
 */
export async function shareLink(title: string, path: string, note?: string | null): Promise<void> {
  const url = webUrl(path);
  const message = note?.trim() ? `${title}\n${note.trim()}\n${url}` : `${title}\n${url}`;
  try {
    await Share.share({ title, url, message });
  } catch {
    // Sharing is never load-bearing. A failure here costs the user nothing they
    // cannot retry, and an error dialog over a share sheet is noise.
  }
}
