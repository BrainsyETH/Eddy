/** Keep missing estimates distinct from a model deliberately withheld for this water. */
export function startEstimateMessage(input: {
  loading: boolean;
  failed: boolean;
  reason?: 'dangerous' | 'regulated' | null;
  typical: boolean;
}): string {
  if (input.loading) return 'Checking float time…';
  if (input.reason === 'dangerous') return 'Flood conditions · time estimate unavailable';
  if (input.reason === 'regulated') return 'Dam-controlled flow · no advance time estimate';
  if (input.failed) return 'Couldn’t check float time.';
  if (input.typical) return 'Current water data unavailable · no time estimate';
  return 'Eddy will learn your pace once you’re moving.';
}
