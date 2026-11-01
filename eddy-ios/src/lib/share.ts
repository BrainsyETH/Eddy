// eddy-ios/src/lib/share.ts
// Handing someone else a link to what you are looking at.
//
// ── What gets shared is a WEB url, always ───────────────────────────────────
// Never an eddy:// link. The person on the other end of a text message has not
// installed this app — that is most of the point of sending it — and a custom
// scheme lands them on an error page. eddy.guide answers every one of these
// routes, renders server-side, and unfurls with a preview card.
//
// Dedicated gauge/chart shares can open the app after the association release
// gate is enabled. The website remains the fallback for recipients without it.
// See docs/decisions/0015-gauge-and-chart-sharing.md.
//
// ── The app's routes are not the website's ──────────────────────────────────
// This is the trap the whole file exists to avoid. The app routes to
// /river/<slug>; the website is /rivers/<state>/<slug>. Singular vs plural, and
// a state segment the app has never had. Composing a share URL out of the route
// the user is standing on produces a 404 for every river.
//
// River and access-point paths come from the server. Gauge shares use the
// shared provider-aware contract, preserving the exact station on the web.

import { shareStation, gaugeSharePath as sharedGaugePath } from '@eddy/conditions/chart-share';
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

/** Dedicated station shares preserve identity and keep ordinary website links unchanged. */
export function gaugeSharePath(provider: string | null | undefined, siteId: string | null | undefined): string | null {
  const station = shareStation(provider ?? '', siteId ?? '');
  return station ? sharedGaugePath(station) : null;
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
 * ── No condition text ───────────────────────────────────────────────────
 *
 * The message is the title and the link, nothing else. Eddy's condition
 * summary once rode along as a middle line, and it reached the recipient with
 * no time attached, so a verdict about this morning's water read as current
 * days later. Opening the link is how a recipient gets current conditions
 * (missouri-float-planner/docs/SHARING_PREVIEWS.md). A share that states a
 * condition, such as a future alert share, carries the observation's date,
 * time and time zone in its own helper.
 */
export async function shareLink(title: string, path: string): Promise<void> {
  const url = webUrl(path);
  const message = `${title}\n${url}`;
  try {
    await Share.share({ title, url, message });
  } catch {
    // Sharing is never load-bearing. A failure here costs the user nothing they
    // cannot retry, and an error dialog over a share sheet is noise.
  }
}
