/** Native shortcuts carry identifiers, never a saved plan or a GPS position. */
interface RiverStar { kind: string; entityId: string; name: string; slug: string; starredAt: string }
interface SavedRoute { shortCode: string; riverSlug: string; riverName: string; putInName: string; takeOutName: string; putInId?: string; takeOutId?: string; savedAt: string }
export interface ShortcutChoice { id: string; name: string; subtitle: string }
export function shortcutCatalog(stars: readonly RiverStar[], routes: readonly SavedRoute[]) {
  return { version: 1,
    rivers: stars.filter(s => s.kind === 'river' && s.slug).sort((a, b) => b.starredAt.localeCompare(a.starredAt))
      .map(s => ({ id: s.entityId, name: s.name, subtitle: '' })),
    routes: [...routes].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map(r => ({ id: r.shortCode, name: r.riverName, subtitle: `${r.putInName} → ${r.takeOutName}` })),
  };
}
export type RecorderState = 'loading' | 'active' | 'none' | 'unreadable';
interface ShortcutContext { recorder: RecorderState; collectionsReady: boolean }
function readRequest(raw: string, now: number) {
  let request;
  try { request = JSON.parse(raw); } catch { return null; }
  if (request?.version !== 1 || !Number.isFinite(request.createdAt) || now - request.createdAt > 120_000 || request.createdAt > now + 5000) return null;
  return ['float', 'river', 'route'].includes(request.kind) ? request : null;
}
/** undefined means keep the request until local restoration finishes. */
export function shortcutDestination(raw: string, stars: readonly RiverStar[], routes: readonly SavedRoute[], context: ShortcutContext, now = Date.now()): string | null | undefined {
  const request = readRequest(raw, now);
  if (!request) return null;
  if (request.kind === 'float' || request.kind === 'route') {
    if (context.recorder === 'loading') return undefined;
    // An unreadable recorder is not evidence that no float is running. Open
    // the existing recovery presentation instead of offering another start.
    if (context.recorder === 'active' || context.recorder === 'unreadable') return '/float-mode';
    if (request.kind === 'float') return '/(tabs)/(floats)/float-home';
  }
  if (!context.collectionsReady) return undefined;
  if (request.kind === 'river') {
    const rivers = stars.filter(s => s.kind === 'river' && s.slug).sort((a, b) => b.starredAt.localeCompare(a.starredAt));
    const river = request.entityId ? rivers.find(s => s.entityId === request.entityId) : rivers[0];
    return river ? `/river/${encodeURIComponent(river.slug)}` : '/(tabs)/(favorites)/favorites';
  }
  if (request.kind === 'route') {
    const route = request.entityId ? routes.find(r => r.shortCode === request.entityId) : null;
    if (!route) return '/(tabs)/(floats)/floats';
    if (!route.putInId || !route.takeOutId) return `/float/${encodeURIComponent(route.shortCode)}`;
    const params = new URLSearchParams({ riverSlug: route.riverSlug, putInId: route.putInId, takeOutId: route.takeOutId, shortCode: route.shortCode, step: 'summary' });
    return `/float-start?${params}`;
  }
  return null;
}

/** Re-read both session and account collections after the cold disk load. */
export async function resolveShortcutRequest(raw: string, source: {
  restoreRecorder(): Promise<void>;
  read(): { stars: readonly RiverStar[]; routes: readonly SavedRoute[]; context: ShortcutContext };
}, clock = Date.now) {
  const request = readRequest(raw, clock());
  if (!request) return null;
  if (request.kind === 'float' || request.kind === 'route') await source.restoreRecorder();
  const { stars, routes, context } = source.read();
  return shortcutDestination(raw, stars, routes, context, clock());
}
