'use client';
import { useCallback, useEffect, useState } from 'react';
/** Keep the list scope in history. Native history integrates with App Router. */
export function useAdminListState(
  key: string,
  initial = 'all',
): [string, (value: string | ((old: string) => string)) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sync = () =>
      setValue(new URLSearchParams(location.search).get(key) ?? initial);
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('admin-list-state', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('admin-list-state', sync);
    };
  }, [key, initial]);
  const change = useCallback(
    (next: string | ((old: string) => string)) => {
      const url = new URL(location.href);
      const old = url.searchParams.get(key) ?? initial;
      const resolved = typeof next === 'function' ? next(old) : next;
      if (resolved === initial) url.searchParams.delete(key);
      else url.searchParams.set(key, resolved);
      if (key !== 'page') url.searchParams.delete('page');
      if (url.href !== location.href) history.pushState(null, '', url);
      window.dispatchEvent(new Event('admin-list-state'));
    },
    [key, initial],
  );
  return [value, change];
}
