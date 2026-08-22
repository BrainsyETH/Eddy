/** Pure request-error normalization shared by every transport entry point. */
export function requestErrorMessage(error: unknown, timedOut: boolean): string {
  const aborted = error instanceof Error && error.name === 'AbortError';
  return aborted && !timedOut ? 'Request cancelled' : 'No connection';
}
