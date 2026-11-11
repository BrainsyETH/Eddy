'use client';
// src/components/admin/ListPager.tsx
// Previous/next footer for server-paged admin lists. Shows the matching total
// even on a single page, so a capped list can never look complete when it isn't.

interface Props {
  page: number;
  total: number;
  pageSize: number;
  /** Plural noun for the count, e.g. "items" or "messages". */
  noun: string;
  onPage: (page: number) => void;
}

export default function ListPager({ page, total, pageSize, noun, onPage }: Props) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-2 pt-4"
    >
      <p className="text-sm text-neutral-500">
        {first}–{last} of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed admin-secondary"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => onPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
            className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed admin-secondary"
          >
            Next
          </button>
        </div>
      )}
    </nav>
  );
}
