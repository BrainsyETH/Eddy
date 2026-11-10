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

export const ADMIN_AUTH_EXPIRED_EVENT = 'admin-auth-expired';
export const ADMIN_AUTH_RESTORED_EVENT = 'admin-auth-restored';
export const ADMIN_CHANGED_EVENT = 'admin-data-changed';
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
      setPassword('');
      window.dispatchEvent(new Event(ADMIN_AUTH_RESTORED_EVENT));
    },
    [queryClient],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/session', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) accept(await res.json());
        else if (res.status === 401) setAuthorized(false);
        else throw new Error('We could not check your session. Try again.');
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setAuthorized(false);
          setError(
            err instanceof Error
              ? err.message
              : 'Connection failed. Try again.',
          );
        }
      });
    return () => controller.abort();
  }, [accept, checking]);

  useEffect(() => {
    const expired = () => {
      document
        .querySelectorAll<HTMLDialogElement>('dialog[open]')
        .forEach((dialog) => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
          dialog.close();
        });
      setAuthorized(false);
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
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...(legacy ? {} : { email }) }),
      });
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
    if (!res || (!res.ok && res.status !== 401)) {
      setError('Sign-out did not finish. Check your connection and try again.');
      return;
    }
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
  }, [queryClient]);

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
                    }}
                  >
                    {legacy
                      ? 'Use a named account'
                      : 'Use owner recovery access'}
                  </button>
                  {error && (
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
