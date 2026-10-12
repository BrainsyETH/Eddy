import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { floatArchive } from '@/lib/floatArchive';
import { discardFloat } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';
import { readFloatArchive, writeFloatArchive, setFloatContribution } from '@/api/client';
import type { ArchiveTransport } from '@/lib/floatArchiveCore';
import { useSession } from './useSession';

const readSnapshot = () => floatArchive.snapshot();
type Value = ReturnType<typeof readSnapshot> & {
  refresh: () => Promise<boolean>;
  retryRejected: () => Promise<void>;
  setConsent: (enabled: boolean) => Promise<void>;
  clear: () => Promise<void>;
};
const Context = createContext<Value>({
  ...readSnapshot(),
  refresh: async () => false,
  retryRejected: async () => {},
  setConsent: async () => {},
  clear: async () => {},
});

export function FloatArchiveProvider({ children }: { children: ReactNode }) {
  const { session, ready, isAnonymous, getAccessToken } = useSession();
  const scope = session && !isAnonymous ? session.user.id : 'guest';
  const [snapshot, setSnapshot] = useState(readSnapshot);
  useEffect(() => floatArchive.subscribe(() => setSnapshot(readSnapshot())), []);
  useEffect(() => {
    if (ready) void floatArchive.select(scope).catch(() => {});
  }, [ready, scope]);
  const transport = useCallback((): ArchiveTransport => {
    const withToken = async <T,>(fn: (token: string) => Promise<T>) => {
      const token = await getAccessToken(scope);
      // Checking scope again prevents a refreshed token from crossing accounts.
      if (!token || floatArchive.scope() !== scope) throw new Error('Sign in again to back up your floats.');
      return fn(token);
    };
    return {
      read: () => withToken(readFloatArchive),
      write: (rows) => withToken((token) => writeFloatArchive(token, rows)),
      consent: (enabled) => withToken((token) => setFloatContribution(token, enabled)),
    };
  }, [scope, getAccessToken]);
  const sync = useCallback(async (force = false) => {
    if (!ready) return;
    if (!floatArchive.snapshot().ready || floatArchive.snapshot().owner !== scope) await floatArchive.select(scope);
    if (scope !== 'guest') await floatArchive.sync(scope, transport(), force);
  }, [ready, scope, transport]);
  const refresh = useCallback(async () => {
    try { await sync(true); } catch { return false; }
    return floatArchive.snapshot().ready && floatArchive.snapshot().owner === scope;
  }, [scope, sync]);
  const retryRejected = useCallback(async () => {
    await floatArchive.retryRejected(scope);
    await sync(true);
  }, [scope, sync]);
  const autoSync = useCallback(() => { void sync().catch(() => {}); }, [sync]);
  // A brief debounce coalesces fixes to saved metadata. Retry on foreground and
  // periodically while open, so reconnecting does not need a relaunch.
  const pending = snapshot.rows.some((r) => r.dirty);
  useEffect(() => {
    if (!snapshot.ready || snapshot.owner !== scope) return;
    const timer = setTimeout(autoSync, 1500);
    return () => clearTimeout(timer);
  }, [snapshot.ready, snapshot.owner, scope, pending, autoSync]);
  useEffect(() => {
    const off = onForeground(autoSync);
    const timer = setInterval(autoSync, 60000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [autoSync]);
  const setConsent = useCallback(
    (enabled: boolean) => floatArchive.setConsent(scope, enabled, transport()),
    [scope, transport],
  );
  const clear = useCallback(async () => {
    const deletingScope = scope === 'guest' ? snapshot.scopeToken : scope;
    await discardFloat();
    await floatArchive.clear(deletingScope);
  }, [scope, snapshot.scopeToken]);
  const value = useMemo(
    () => ({
      ...snapshot,
      refresh,
      retryRejected,
      setConsent,
      clear,
      // Never show the old account for the render before the effect selects anew.
      ready: snapshot.ready && snapshot.owner === scope,
      rows: snapshot.owner === scope ? snapshot.rows : [],
    }),
    [snapshot, refresh, retryRejected, setConsent, clear, scope],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useFloatArchive = () => useContext(Context);
