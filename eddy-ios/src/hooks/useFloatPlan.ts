// eddy-ios/src/hooks/useFloatPlan.ts
// The float plan, as a small state machine: put-in → take-out → boat → answer.
//
// WHY A HOOK AND NOT STATE IN THE SHEET: the plan outlives the sheet. Once it
// exists the map draws the route and the endpoints underneath, and closing the
// sheet must not throw that away — someone plans a float, dismisses the sheet
// to look at the water between the two ends, and reopens it. So the plan lives
// on the screen and the sheet is a view onto it.
//
// ── Direction is not a preference ───────────────────────────────────────────
// river_mile_downstream counts from the headwaters, so a valid float always has
// takeOut.riverMile > putIn.riverMile. The take-out list is filtered to
// downstream points rather than validated after the fact: an impossible
// selection should be unreachable, not rejected. Rivers flow one way and the
// app should never make someone discover that from an error message.
//
// ── One request, on an explicit tap ─────────────────────────────────────────
// /api/plan is the heaviest call the app makes — it reaches USGS for a live
// reading at the put-in and Mapbox for the shuttle drive. It therefore runs
// when someone asks for a plan, never speculatively as they move between
// access points.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloatPlan, MapAccessPoint, VesselType } from '@eddy/types';
import { ApiError, fetchFloatPlan, fetchVesselTypes } from '@/api/client';

export type PlanStep = 'put-in' | 'take-out' | 'vessel' | 'result';

export interface FloatPlanState {
  step: PlanStep;
  putIn: MapAccessPoint | null;
  takeOut: MapAccessPoint | null;
  vessel: VesselType | null;
  vessels: VesselType[];
  /** False until the vessel fetch settles, so empty reads as "none" not "wait". */
  vesselsLoaded: boolean;
  plan: FloatPlan | null;
  calculating: boolean;
  error: string | null;
  /** Points ordered headwaters-first — the order a float actually happens in. */
  putInOptions: MapAccessPoint[];
  /** Only what is downstream of the chosen put-in. Empty until one is chosen. */
  takeOutOptions: MapAccessPoint[];
  choosePutIn: (point: MapAccessPoint) => void;
  chooseTakeOut: (point: MapAccessPoint) => void;
  chooseVessel: (vessel: VesselType) => void;
  /**
   * Build the plan without choosing a boat.
   *
   * The escape hatch for a failed or empty vessel list. /api/plan defaults to
   * the first vessel type when none is sent, so the plan is still real — and
   * without this, a vessel fetch that fails would leave the whole planner
   * permanently stuck one step from an answer.
   */
  skipVessel: () => void;
  goToStep: (step: PlanStep) => void;
  reset: () => void;
}

export function useFloatPlan(riverId: string | null, accessPoints: MapAccessPoint[]): FloatPlanState {
  const [step, setStep] = useState<PlanStep>('put-in');
  const [putIn, setPutIn] = useState<MapAccessPoint | null>(null);
  const [takeOut, setTakeOut] = useState<MapAccessPoint | null>(null);
  const [vessel, setVessel] = useState<VesselType | null>(null);
  const [vessels, setVessels] = useState<VesselType[]>([]);
  const [vesselsLoaded, setVesselsLoaded] = useState(false);
  const [plan, setPlan] = useState<FloatPlan | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vessel types are a handful of rows that change roughly never, and the list
  // is CDN-cached for an hour. Loading it once here means the boat step never
  // shows a spinner. A failure is silent: /api/plan defaults to the first
  // vessel when none is sent, so an empty list costs the choice, not the plan.
  useEffect(() => {
    const controller = new AbortController();
    fetchVesselTypes(controller.signal)
      .then(setVessels)
      .catch(() => setVessels([]))
      .finally(() => {
        if (!controller.signal.aborted) setVesselsLoaded(true);
      });
    return () => controller.abort();
  }, []);

  // Changing river invalidates everything: an access point belongs to exactly
  // one river, and a half-built plan carried across would pair two rivers'
  // points into a segment the server cannot resolve.
  useEffect(() => {
    setStep('put-in');
    setPutIn(null);
    setTakeOut(null);
    setPlan(null);
    setError(null);
  }, [riverId]);

  const putInOptions = useMemo(
    () => [...accessPoints].sort((a, b) => a.riverMile - b.riverMile),
    [accessPoints],
  );

  const takeOutOptions = useMemo(
    () => (putIn ? putInOptions.filter((p) => p.riverMile > putIn.riverMile) : []),
    [putInOptions, putIn],
  );

  const calculate = useCallback(
    async (start: MapAccessPoint, end: MapAccessPoint, boat: VesselType | null) => {
      if (!riverId) return;
      setCalculating(true);
      setError(null);
      setStep('result');
      try {
        const result = await fetchFloatPlan({
          riverId,
          startId: start.id,
          endId: end.id,
          vesselTypeId: boat?.id,
        });
        setPlan(result);
      } catch (err) {
        setPlan(null);
        setError(
          err instanceof ApiError
            ? // The server answers 500 when it cannot resolve a segment between
              // two points, which is not a server fault the user can act on —
              // say what it means for them instead.
              err.status === 500
              ? 'We could not work out a float between those two points. Try a different pair.'
              : err.message
            : 'Could not build that float plan',
        );
      } finally {
        setCalculating(false);
      }
    },
    [riverId],
  );

  const choosePutIn = useCallback((point: MapAccessPoint) => {
    setPutIn(point);
    // A take-out upstream of the new put-in is no longer a float. Dropping it
    // here is what keeps takeOutOptions and the selection from disagreeing.
    setTakeOut((current) => (current && current.riverMile > point.riverMile ? current : null));
    setPlan(null);
    setStep('take-out');
  }, []);

  const chooseTakeOut = useCallback((point: MapAccessPoint) => {
    setTakeOut(point);
    setPlan(null);
    setStep('vessel');
  }, []);

  const chooseVessel = useCallback(
    (next: VesselType) => {
      setVessel(next);
      if (putIn && takeOut) void calculate(putIn, takeOut, next);
    },
    [putIn, takeOut, calculate],
  );

  const skipVessel = useCallback(() => {
    if (putIn && takeOut) void calculate(putIn, takeOut, null);
  }, [putIn, takeOut, calculate]);

  const reset = useCallback(() => {
    setStep('put-in');
    setPutIn(null);
    setTakeOut(null);
    setPlan(null);
    setError(null);
  }, []);

  return {
    step,
    putIn,
    takeOut,
    vessel,
    vessels,
    vesselsLoaded,
    plan,
    calculating,
    error,
    putInOptions,
    takeOutOptions,
    choosePutIn,
    chooseTakeOut,
    chooseVessel,
    skipVessel,
    goToStep: setStep,
    reset,
  };
}
