/** Public URLs remain stable; groups only choose a tab's navigation history. */
export const TAB_ROOTS = { today: 'reports', map: 'index', alerts: 'alerts', favorites: 'favorites', settings: 'profile' } as const;

export const DETAIL_TITLES: Record<string, string> = {
  weather: 'Weather',
  'current-alerts': 'Current alerts',
  camping: 'Camping',
  'gauge/[siteId]': 'Gauge',
  'river/[slug]': 'River',
  'river/[slug]/access/[accessSlug]': 'Access point',
  'dam/[damId]': 'Dam',
  'float/[shortCode]': 'Float',
  floats: 'Saved floats',
  'favorite-floats': 'Favorite floats',
  storage: 'Storage',
  'river-conditions': 'River Conditions',
  'eddy-reads': 'Eddy’s Reads',
};

// Cold links have no originating tab. Match the destination's place in the app.
const COLD_TAB_OWNERS: Partial<Record<string, keyof typeof TAB_ROOTS>> = {
  storage: 'settings',
  floats: 'favorites',
};

/** Plain launches and known shared details need a tab owner on a cold link. */
export function coldDetailPath(path: string): string {
  const pathname = path.split(/[?#]/)[0];
  // The public / route belongs to Map for existing internal links. On a plain
  // launch it otherwise wins over the tabs' initialRouteName and opens Map.
  if (pathname === '' || pathname === '/') {
    const params = new URLSearchParams(path.split('?')[1]?.split('#')[0]);
    const mapIntent = ['focusAccess', 'focusRiver', 'openPlan', 'planPutIn', 'planTakeOut'].some(key => params.has(key));
    return mapIntent ? path : `/(tabs)/(today)/reports${path.slice(pathname.length)}`;
  }
  const shared = Object.keys(DETAIL_TITLES).find(route => {
    const pattern = route.split('/').map(part => part.startsWith('[') ? '[^/]+' : part).join('/');
    return new RegExp(`^/${pattern}/?$`).test(pathname);
  });
  // Alert creation and management are root modals, not shared tab details.
  return shared
    ? `/(tabs)/(${COLD_TAB_OWNERS[shared] ?? 'today'})${path}` : path;
}
