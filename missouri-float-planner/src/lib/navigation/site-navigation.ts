import { stateCodeFromSlug } from './states';

export interface SiteNavLink {
  href: string;
  label: string;
  active: boolean;
}

const belongsTo = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);
const riverSlug = (value: string | null | undefined) => value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;

/** Context comes from the current page, never a river remembered on another page. */
export function navigationRiver(pathname: string, search = ''): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'rivers' && parts[1]) {
    if (stateCodeFromSlug(parts[1])) {
      // /rivers/missouri/access/... is an access directory, not a river.
      return parts[2] === 'access' ? null : riverSlug(parts[2]);
    }
    return riverSlug(parts[1]); // Legacy /rivers/current redirects remain usable.
  }
  if (['/plan', '/find-float', '/river-map'].includes(pathname)) {
    return riverSlug(new URLSearchParams(search).get('river'));
  }
  return null;
}

export function siteNavigation(pathname: string, search: string, floatSearchEnabled: boolean): SiteNavLink[] {
  const [finder, planner] = floatNavigation(pathname, search);
  return [
    { href: '/rivers', label: 'Conditions', active: ['/rivers', '/gauges', '/dams'].some(base => belongsTo(pathname, base)) },
    { href: planner.href, label: 'Map', active: belongsTo(pathname, '/plan') },
    ...(floatSearchEnabled ? [{
      href: finder.href,
      label: 'Floats',
      active: belongsTo(pathname, '/find-float'),
    }] : []),
    { href: '/blog', label: 'Guides', active: belongsTo(pathname, '/blog') },
  ];
}

export function conditionNavigation(active: 'rivers' | 'dams'): SiteNavLink[] {
  return [
    { href: '/rivers', label: 'Rivers', active: active === 'rivers' },
    { href: '/dams', label: 'Lakes & Dams', active: active === 'dams' },
  ];
}

export function floatNavigation(pathname: string, search = ''): SiteNavLink[] {
  const params = new URLSearchParams(search);
  const river = navigationRiver(pathname, search);
  const route = new URLSearchParams();
  if (river) {
    route.set('river', river);
    // Carry an existing plan through the finder tab; result links still supply
    // their own endpoints. Never carry tracking, modal, or map-only parameters.
    for (const key of ['putIn', 'takeOut', 'vessel']) {
      // The finder owns its vessel in form state. Its result links use that
      // selection; a vessel left in the incoming URL can be an older choice.
      if (key === 'vessel' && pathname === '/find-float') continue;
      const value = params.get(key);
      if (value) route.set(key, value);
    }
  }
  const suffix = route.size ? `?${route}` : '';
  return [
    { href: `/find-float${suffix}`, label: 'Find a Route', active: pathname === '/find-float' },
    { href: `/plan${suffix}`, label: 'Build a Route', active: pathname === '/plan' },
  ];
}
