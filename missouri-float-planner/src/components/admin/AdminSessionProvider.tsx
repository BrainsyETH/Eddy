'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EDDY_IMAGES } from '@/constants';
import type { AdminIdentity } from '@/lib/admin/permissions';

import {
  ADMIN_AUTH_EXPIRED_EVENT,
  ADMIN_AUTH_RESTORED_EVENT,
  ADMIN_ACCESS_CHANGED_EVENT,
} from '@/lib/admin/session-client';
export { ADMIN_CHANGED_EVENT } from '@/lib/admin/session-client';
interface Session {
  isAuthorized: boolean | null;
  identity: AdminIdentity | null;
  password: string;
  setPassword: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  error: string;
  busy: boolean;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: (signal?: AbortSignal) => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export function useAdminSession() {
  const session = useContext(SessionContext);
  if (!session)
    throw new Error('Admin pages must be inside AdminSessionProvider');
  return session;
}

export default function AdminSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [isAuthorized, setAuthorized] = useState<boolean | null>(null);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [checking, setChecking] = useState(0);
  const submitLock = useRef(false);
  const currentIdentity = useRef<AdminIdentity | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);

  const accept = useCallback(
    (data: { identity?: AdminIdentity }) => {
      const next = data.identity ?? {
        id: null,
        name: 'Owner recovery',
        role: 'owner' as const,
        legacy: true,
      };
      if (
        currentIdentity.current &&
        (currentIdentity.current.id !== next.id ||
          currentIdentity.current.role !== next.role)
      ) {
        window.dispatchEvent(new Event('admin-signed-out'));
        queryClient.removeQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith('admin-'),
        });
        setWorkspaceKey((key) => key + 1);
      }
      currentIdentity.current = next;
      setIdentity(next);
      setAuthorized(true);
      setMounted(true);
      setError('');
      setConnectionError(false);
      setPassword('');
      window.dispatchEvent(new Event(ADMIN_AUTH_RESTORED_EVENT));
    },
    [queryClient],
  );

  const clearWorkspace = useCallback(
    (message = '') => {
      window.dispatchEvent(new Event('admin-signed-out'));
      queryClient.removeQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('admin-'),
      });
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith('eddy-admin-draft:'))
          .forEach((k) => sessionStorage.removeItem(k));
      } catch {}
      currentIdentity.current = null;
      setMounted(false);
      setAuthorized(false);
      setIdentity(null);
      setPassword('');
      setError(message);
      setConnectionError(false);
    },
    [queryClient],
  );

  const refreshSession = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch('/api/admin/session', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        });
        const data = await res.json();
        if (signal?.aborted) return;
        if (res.ok) accept(data);
        else if (res.status === 401) {
          setAuthorized(false);
          setConnectionError(false);
        } else if (res.status === 403 && data.reason === 'access-revoked') {
          clearWorkspace(data.error);
        } else {
          setAuthorized(false);
          setError(data.error || 'We could not check your session. Try again.');
          setConnectionError(res.status === 503);
        }
      } catch {
        if (!signal?.aborted) {
          setAuthorized(false);
          setError('Connection failed. Try again.');
          setConnectionError(true);
        }
      }
    },
    [accept, clearWorkspace],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshSession(controller.signal);
    return () => controller.abort();
  }, [refreshSession, checking]);

  useEffect(() => {
    const changed = (event: Event) => {
      const data = (
        event as CustomEvent<{
          reason: string;
          error: string;
          identity?: AdminIdentity;
        }>
      ).detail;
      if (data.reason === 'access-revoked') clearWorkspace(data.error);
      else if (
        data.reason === 'role-forbidden' &&
        data.identity &&
        currentIdentity.current?.id === data.identity.id &&
        currentIdentity.current?.role !== data.identity.role
      ) {
        // A denied action is not a new sign-in. Ignore late responses after
        // sign-out/account switching, and only reconcile an actual role change.
        accept(data);
      }
    };
    window.addEventListener(ADMIN_ACCESS_CHANGED_EVENT, changed);
    return () =>
      window.removeEventListener(ADMIN_ACCESS_CHANGED_EVENT, changed);
  }, [accept, clearWorkspace]);

  useEffect(() => {
    const expired = () => {
      document
        .querySelectorAll<HTMLDialogElement>('dialog[open]')
        .forEach((dialog) => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
          dialog.close();
        });
      setAuthorized(false);
      setConnectionError(false);
      setError(
        'Your session expired. Sign in to continue; your edits are kept.',
      );
    };
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, expired);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    setConnectionError(false);
    let receivedResponse = false;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...(legacy ? {} : { email }) }),
      });
      receivedResponse = true;
      setConnectionError(res.status === 503);
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          res.status === 429
            ? 'Too many attempts. Please try again in 15 minutes.'
            : data.error || 'Sign-in failed.',
        );
      accept(data);
      void queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith('admin-'),
      });
    } catch (err) {
      if (!receivedResponse) setConnectionError(true);
      setError(
        err instanceof Error ? err.message : 'Connection failed. Try again.',
      );
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const logout = useCallback(async () => {
    const res = await fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
      setError('Sign-out did not finish. Check your connection and try again.');
      return;
    }
    clearWorkspace();
  }, [clearWorkspace]);

  return (
    <SessionContext.Provider
      value={{
        isAuthorized,
        identity,
        password,
        setPassword,
        email,
        setEmail,
        error,
        busy,
        handleSubmit,
        logout,
        refreshSession,
      }}
    >
      {mounted && (
        <div key={workspaceKey} hidden={!isAuthorized}>
          {children}
        </div>
      )}
      {!isAuthorized && (
        <div className="admin-login">
          <section aria-labelledby="admin-login-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EDDY_IMAGES.favicon} alt="" width={64} height={64} />
            <p className="admin-eyebrow">EDDY ADMIN</p>
            <h1 id="admin-login-title">
              {isAuthorized === null
                ? 'Checking your session…'
                : mounted
                  ? 'Welcome back.'
                  : 'A little work. More river.'}
            </h1>
            {isAuthorized !== null && (
              <>
                <p>
                  {mounted
                    ? 'Sign in to pick up where you left off.'
                    : 'Sign in to your admin workspace.'}
                </p>
                <form onSubmit={handleSubmit}>
                  {!legacy && (
                    <label>
                      Email
                      <input
                        autoComplete="username"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    Password
                    <input
                      autoComplete="current-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  {error && (
                    <p role="alert" className="admin-error">
                      {error}
                    </p>
                  )}
                  <button className="admin-primary" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    className="admin-link"
                    onClick={() => {
                      setLegacy(!legacy);
                      setError('');
                      setConnectionError(false);
                    }}
                  >
                    {legacy
                      ? 'Use a named account'
                      : 'Use owner recovery access'}
                  </button>
                  {error && connectionError && (
                    <button
                      type="button"
                      className="admin-link"
                      onClick={() => setChecking((n) => n + 1)}
                    >
                      Check connection again
                    </button>
                  )}
                </form>
              </>
            )}
            <Link href="/">View Eddy</Link>
          </section>
        </div>
      )}
    </SessionContext.Provider>
  );
}
