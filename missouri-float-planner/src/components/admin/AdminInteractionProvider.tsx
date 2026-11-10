'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

interface Prompt {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  alert?: boolean;
  resolve: (answer: boolean) => void;
}
interface Interactions {
  confirm: (
    message: string,
    options?: { confirmLabel?: string; danger?: boolean },
  ) => Promise<boolean>;
  alert: (message: string) => Promise<boolean>;
  setDirty: (id: string, value: boolean) => void;
  canDiscardChanges: () => Promise<boolean>;
}
const Context = createContext<Interactions | null>(null);
export function useAdminInteractions() {
  const value = useContext(Context);
  if (!value)
    throw new Error('Admin interactions require the workspace provider');
  return value;
}
export function useUnsavedAdminChanges(dirty: boolean) {
  const id = useId();
  const { setDirty, confirm } = useAdminInteractions();
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [id, dirty, setDirty]);
  return useCallback(
    () =>
      !dirty
        ? Promise.resolve(true)
        : confirm('Discard your unsaved changes?', {
            confirmLabel: 'Discard changes',
            danger: true,
          }),
    [dirty, confirm],
  );
}
export default function AdminInteractionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const dirty = useRef(new Set<string>());
  const currentPrompt = useRef<Prompt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const setDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);
  const ask = useCallback(
    (
      message: string,
      options: {
        confirmLabel?: string;
        danger?: boolean;
        alert?: boolean;
      } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        if (currentPrompt.current) {
          resolve(false);
          return;
        }
        opener.current = document.activeElement as HTMLElement;
        const next = { message, ...options, resolve };
        currentPrompt.current = next;
        setPrompt(next);
      }),
    [],
  );
  const confirm = useCallback(
    (message: string, options?: { confirmLabel?: string; danger?: boolean }) =>
      ask(message, options),
    [ask],
  );
  const alert = useCallback(
    (message: string) => ask(message, { alert: true, confirmLabel: 'OK' }),
    [ask],
  );
  const canDiscardChanges = useCallback(
    () =>
      dirty.current.size
        ? confirm('Discard your unsaved changes?', {
            confirmLabel: 'Discard changes',
            danger: true,
          })
        : Promise.resolve(true),
    [confirm],
  );
  const finish = useCallback((answer: boolean) => {
    const pending = currentPrompt.current;
    currentPrompt.current = null;
    dialog.current?.close();
    setPrompt(null);
    pending?.resolve(answer);
    opener.current?.focus();
  }, []);
  useEffect(() => {
    if (prompt) dialog.current?.showModal();
  }, [prompt]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href]',
      );
      if (
        !dirty.current.size ||
        !link ||
        link.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      const url = new URL(link.href, location.href);
      if (
        url.href === location.href ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void confirm('Leave this page and discard unsaved changes?', {
        confirmLabel: 'Leave page',
        danger: true,
      }).then((yes) => {
        if (yes) {
          dirty.current.clear();
          location.assign(url.href);
        }
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
      currentPrompt.current?.resolve(false);
    };
  }, [confirm]);
  return (
    <Context.Provider value={{ confirm, alert, setDirty, canDiscardChanges }}>
      {children}
      {prompt && (
        <dialog
          ref={dialog}
          className="admin-confirm"
          aria-labelledby="admin-confirm-title"
          onCancel={() => finish(false)}
        >
          <h2 id="admin-confirm-title">
            {prompt.alert ? 'Eddy admin' : 'Before you continue'}
          </h2>
          <p>{prompt.message}</p>
          <div className="admin-actions">
            {!prompt.alert && (
              <button autoFocus onClick={() => finish(false)}>
                Keep working
              </button>
            )}
            <button
              className={prompt.danger ? 'admin-danger' : 'admin-primary'}
              onClick={() => finish(true)}
            >
              {prompt.confirmLabel ?? 'Continue'}
            </button>
          </div>
        </dialog>
      )}
    </Context.Provider>
  );
}
