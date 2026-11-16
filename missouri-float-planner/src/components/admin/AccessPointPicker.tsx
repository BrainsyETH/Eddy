'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '@/hooks/useAdminAuth';

interface AccessOption {
  id: string;
  name: string;
  riverName: string | null;
}

export default function AccessPointPicker({
  value,
  currentName,
  onChange,
}: {
  value: string;
  currentName?: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Cards share a cache and only load options when used. Opening a lake with
  // hundreds of launches must not start hundreds of search requests.
  const {
    data: options = [],
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['admin-access-point-options', query],
    enabled: active,
    staleTime: 60_000,
    retry: 1,
    queryFn: async ({ signal }): Promise<AccessOption[]> => {
      const response = await adminFetch(
        `/api/admin/access-points?q=${encodeURIComponent(query)}&limit=30`,
        { signal },
      );
      if (!response.ok) throw new Error('Could not search access points.');
      return (await response.json()).accessPoints;
    },
  });

  return (
    <div onFocus={() => setActive(true)}>
      <label htmlFor={id}>Link an existing access point</label>
      <input
        id={id}
        className="block w-full border rounded p-2 mt-1"
        placeholder="Search by name"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <label htmlFor={`${id}-choice`} className="sr-only">
        Matching access point
      </label>
      <select
        id={`${id}-choice`}
        className="block w-full border rounded p-2 mt-1"
        value={value}
        onChange={(event) => {
          setSelectedName(
            options.find((option) => option.id === event.target.value)?.name ??
              '',
          );
          onChange(event.target.value);
        }}
      >
        <option value="">No linked access point</option>
        {value && !options.some((option) => option.id === value) && (
          <option value={value}>
            {currentName || selectedName || 'Linked access point'}
          </option>
        )}
        {options.map((option) => (
          <option value={option.id} key={option.id}>
            {option.name}
            {option.riverName ? ` · ${option.riverName}` : ''}
          </option>
        ))}
      </select>
      {isFetching && <p role="status">Searching…</p>}
      {isError && (
        <p role="alert">
          Could not search access points.{' '}
          <button
            type="button"
            className="admin-link"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
