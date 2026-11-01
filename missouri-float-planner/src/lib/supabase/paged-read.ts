// src/lib/supabase/paged-read.ts
// Read every row of a PostgREST query, or fail loudly.
//
// Two silent failures this exists to remove. PostgREST truncates a response at
// the project's max-rows setting (1,000 by default) without saying so, and a
// long `in` list becomes a request line PostgREST refuses. And a read that
// resolves with an error is not an empty read: callers that wrote
// `data ?? []` turned outages into decisions ("nobody subscribed", "no
// starred gauges"). These helpers page, chunk, and throw ReadError instead.

/** Rows per page. Must not exceed the project's PostgREST max-rows setting. */
export const READ_PAGE = 1000;
/** Ids per `in` filter, bounded by the request line's length. */
export const IN_CHUNK = 150;

/** A read that failed. Callers decide whether that is fatal; it is never "empty". */
export class ReadError extends Error {
  constructor(what: string, cause: string) {
    super(`could not read ${what}: ${cause}`);
    this.name = 'ReadError';
  }
}

interface PageResult {
  data: unknown[] | null;
  error: { message?: string } | null;
}

/**
 * Every row of a query, page by page. `page(from, to)` must apply a stable
 * `.order()` — without one, consecutive `.range()` windows over an unordered
 * result repeat some rows and skip others.
 */
export async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize = READ_PAGE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new ReadError(what, error.message ?? 'unknown error');
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** readAll for a query filtered by `in` on a list that may be long. */
export async function readAllIn<T>(
  what: string,
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>,
  { chunkSize = IN_CHUNK, pageSize = READ_PAGE } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    out.push(...(await readAll<T>(what, (from, to) => page(chunk, from, to), pageSize)));
  }
  return out;
}

