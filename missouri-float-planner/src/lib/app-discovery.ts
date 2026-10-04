// Public app identity must keep working without deployment configuration.
export const DEFAULT_APPLE_APP_ID = '6794933267';
export const DEFAULT_APP_STORE_URL = `https://apps.apple.com/app/id${DEFAULT_APPLE_APP_ID}`;

interface AppStoreEnvironment {
  url?: string;
  campaignUrl?: string;
  appId?: string;
}

function validStoreUrl(value?: string): URL | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && url.hostname === 'apps.apple.com'
      && !url.username && !url.password && /\/id\d+\/?$/.test(url.pathname)
      ? url : null;
  } catch {
    return null;
  }
}

/** Use short, non-personal campaign names, e.g. partner_foo or spring_search. */
export function campaignToken(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(value) ? value : null;
}

export function resolveAppStoreConfig(env: AppStoreEnvironment) {
  const configuredId = /^\d+$/.test(env.appId?.trim() ?? '') ? env.appId!.trim() : DEFAULT_APPLE_APP_ID;
  const url = validStoreUrl(env.url) ?? new URL(`https://apps.apple.com/app/id${configuredId}`);
  // The banner and button must refer to the same app, including with overrides.
  const appId = url.pathname.match(/\/id(\d+)\/?$/)![1];
  const campaign = validStoreUrl(env.campaignUrl);
  const source = campaign?.pathname.match(/\/id(\d+)\/?$/)?.[1] === appId ? campaign! : url;
  const pt = source.searchParams.get('pt');
  return {
    appId,
    url: `${url.origin}${url.pathname}`,
    providerToken: pt && /^\d+$/.test(pt) ? pt : null,
    campaign: campaignToken(source.searchParams.get('ct')),
  };
}

export const APP_STORE = resolveAppStoreConfig({
  url: process.env.NEXT_PUBLIC_APP_STORE_URL,
  campaignUrl: process.env.NEXT_PUBLIC_APP_STORE_CAMPAIGN_URL,
  appId: process.env.NEXT_PUBLIC_APPLE_APP_ID,
});

export function appStoreUrl(campaign?: string | null, config = APP_STORE): string {
  const url = new URL(config.url);
  // Apple issues pt in App Store Connect. Never fabricate a provider token.
  if (config.providerToken) {
    url.searchParams.set('pt', config.providerToken);
    url.searchParams.set('ct', campaignToken(campaign) ?? config.campaign ?? 'website_download');
    url.searchParams.set('mt', '8');
  }
  return url.toString();
}

export function appLandingUrl(campaign?: string | null): string {
  const token = campaignToken(campaign);
  return token ? `/app?ct=${encodeURIComponent(token)}` : '/app';
}

/** Explicit banner taps use existing app routes; ordinary web links stay on the web. */
export function smartBannerContent(nativePath = '/reports', campaign?: string | null, config = APP_STORE): string {
  const parts = [`app-id=${config.appId}`, `app-argument=eddy://${nativePath}`];
  if (config.providerToken) {
    const attribution = new URLSearchParams({
      pt: config.providerToken,
      ct: campaignToken(campaign) ?? config.campaign ?? 'website_banner',
    });
    parts.push(`affiliate-data=${attribution.toString()}`);
  }
  return parts.join(', ');
}

export function appBannerMetadata(nativePath = '/reports', campaign?: string | null) {
  return { other: { 'apple-itunes-app': smartBannerContent(nativePath, campaign) } };
}
