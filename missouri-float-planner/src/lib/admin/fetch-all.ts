// Read every page of a paged admin list.
//
// Paged list routes default to 50 rows. A caller that needs the whole set (a
// map of every point, a lookup by name) must ask for each page: taking the
// first response as "all of them" is how the Geography map and the Data sync
// promote lost every point of interest past the fiftieth.

export interface PageResult<T> {
  rows: T[];
  /** Matching rows across all pages, when the route reports it. */
  total: number | null;
}

export const FETCH_ALL_PAGE_SIZE = 200;
const MAX_PAGES = 50;

/**
 * Calls `fetchPage(page, limit)` from page 1 until every row is in hand.
 * Throws rather than return a partial list: a silently short list is the bug.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PageResult<T>>,
  limit = FETCH_ALL_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { rows, total } = await fetchPage(page, limit);
    all.push(...rows);
    if (rows.length < limit || (total !== null && all.length >= total)) return all;
  }
  throw new Error(`List did not end after ${MAX_PAGES} pages`);
}

/**
 * Every row of a paged admin list route. `key` names the array in the response
 * (e.g. 'pois'); the route must accept `page` and `limit`.
 */
export async function fetchAllAdminRows<T>(
  fetcher: (url: string) => Promise<Response>,
  path: string,
  key: string,
): Promise<T[]> {
  return fetchAllPages<T>(async (page, limit) => {
    const res = await fetcher(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error(`Could not load ${key}`);
    const data = await res.json();
    return { rows: (data?.[key] ?? []) as T[], total: typeof data?.total === 'number' ? data.total : null };
  });
}
