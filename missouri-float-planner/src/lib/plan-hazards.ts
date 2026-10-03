/** Keep usable plan details when this optional lookup fails. */
export function planHazardResult<T>(data: T[] | null, error: unknown) {
  const hazardsUnavailable = Boolean(error) || data === null;
  return { hazards: hazardsUnavailable ? [] as T[] : data!, hazardsUnavailable };
}
