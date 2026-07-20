export interface ShuttlePlausibility {
  anomaly: boolean;
  warning?: string;
}

/**
 * Flags route output that deserves human verification. This does not declare
 * the route wrong: Ozark road networks can legitimately require long detours.
 */
export function assessShuttlePlausibility(
  roadMiles: number,
  comparisonMiles?: number | null
): ShuttlePlausibility {
  if (!Number.isFinite(roadMiles) || roadMiles <= 0) {
    return { anomaly: true, warning: 'Shuttle distance is unavailable. Verify the route with your outfitter.' };
  }

  const comparison = comparisonMiles && comparisonMiles > 0 ? comparisonMiles : null;
  const extremeRatio = comparison !== null && roadMiles >= 20 && roadMiles / comparison >= 4;
  const veryLongRoute = roadMiles >= 60;

  if (extremeRatio || veryLongRoute) {
    return {
      anomaly: true,
      warning: 'This shuttle route looks unusually long. Confirm both access points, pickup route, and timing with your outfitter.',
    };
  }
  return { anomaly: false };
}
