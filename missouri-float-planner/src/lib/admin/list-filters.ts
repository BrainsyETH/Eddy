export function listPage(params: URLSearchParams, max = 200) {
  const positive = (value: string | null, fallback: number) =>
    value &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
      ? Number(value)
      : fallback;
  const page = Math.min(100000, positive(params.get('page'), 1));
  const limit = Math.min(max, positive(params.get('limit'), 50));
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}
/** Quote the entire PostgREST operand; escape LIKE metacharacters literally. */
export function literalContains(value: string) {
  return JSON.stringify('%' + value.replace(/[\\%_]/g, '\\$&') + '%');
}
export function visibleSelection(ids: Set<string>, rows: { id: string }[]) {
  return rows.filter((r) => ids.has(r.id)).map((r) => r.id);
}
