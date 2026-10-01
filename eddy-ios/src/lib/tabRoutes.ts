/** Public URLs remain stable; groups only choose a tab's navigation history. */
export const TAB_ROOTS = { today: 'reports', map: 'index', alerts: 'alerts', favorites: 'favorites', settings: 'profile' } as const;

export const DETAIL_TITLES: Record<string, string> = {
  weather: 'Weather',
  'current-alerts': 'Current alerts',
  camping: 'Camping',
  'alerts/quiet-hours': 'Quiet hours',
  'gauge/[siteId]': 'Gauge',
  'river/[slug]': 'River',
  'river/[slug]/access/[accessSlug]': 'Access point',
  'dam/[damId]': 'Dam',
  'float/[shortCode]': 'Float',
  floats: 'Saved floats',
  'favorite-floats': 'Favorite floats',
  storage: 'Storage',
  'alerts/[id]': 'Edit alert',
  'river-conditions': 'River Conditions',
  'eddy-reads': 'Eddy’s Reads',
};

// Cold links have no originating tab. Match the destination's place in the app.
const COLD_TAB_OWNERS: Partial<Record<string, keyof typeof TAB_ROOTS>> = {
  storage: 'settings',
  'alerts/quiet-hours': 'settings',
  floats: 'favorites',
  'alerts/[id]': 'alerts',
};

/** Only known shared details need a tab owner on a cold link. */
export function coldDetailPath(path: string): string {
  const pathname = path.split(/[?#]/)[0];
  const shared = Object.keys(DETAIL_TITLES).find(route => {
    const pattern = route.split('/').map(part => part.startsWith('[') ? '[^/]+' : part).join('/');
    return new RegExp(`^/${pattern}/?$`).test(pathname);
  });
  // Creation remains a root modal even though /alerts/[id] could match it.
  return shared && !/^\/alerts\/(new|configure)(?:\/|$)/.test(pathname)
    ? `/(tabs)/(${COLD_TAB_OWNERS[shared] ?? 'today'})${path}` : path;
}
