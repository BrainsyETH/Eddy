import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { floatArchive } from '@/lib/floatArchive';
import { discardFloat } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';
import { readFloatArchive, writeFloatArchive, setFloatContribution } from '@/api/client';
import type { ArchiveTransport } from '@/lib/floatArchiveCore';
import { useSession } from './useSession';

const readSnapshot = () => floatArchive.snapshot();
type Value = ReturnType<typeof readSnapshot> & {
  refresh: () => Promise<void>;
  setConsent: (enabled: boolean) => Promise<void>;
  clear: () => Promise<void>;
};
const Context = createContext<Value>({
  ...readSnapshot(),
  refresh: async () => {},
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
  const refresh = useCallback(async () => {
    if (ready && scope !== 'guest') await floatArchive.sync(scope, transport());
  }, [ready, scope, transport]);
  // A brief debounce coalesces fixes to saved metadata. Retry on foreground and
  // periodically while open, so reconnecting does not need a relaunch.
  const pending = snapshot.rows.some((r) => r.dirty);
  useEffect(() => {
    if (!snapshot.ready || snapshot.owner !== scope) return;
    const timer = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(timer);
  }, [snapshot.ready, snapshot.owner, scope, pending, refresh]);
  useEffect(() => {
    const off = onForeground(() => void refresh());
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [refresh]);
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
      setConsent,
      clear,
      // Never show the old account for the render before the effect selects anew.
      ready: snapshot.ready && snapshot.owner === scope,
      rows: snapshot.owner === scope ? snapshot.rows : [],
    }),
    [snapshot, refresh, setConsent, clear, scope],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useFloatArchive = () => useContext(Context);
