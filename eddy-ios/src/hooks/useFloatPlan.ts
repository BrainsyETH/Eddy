// eddy-ios/src/hooks/useFloatPlan.ts
// The float plan, as a small state machine: put-in → take-out → answer.
//
// WHY A HOOK AND NOT STATE IN THE SHEET: the plan outlives the sheet. Once it
// exists the map draws the route and the endpoints underneath, and closing the
// sheet must not throw that away — someone plans a float, dismisses the sheet
// to look at the water between the two ends, and reopens it. So the plan lives
// on the screen and the sheet is a view onto it.
//
// ── Two questions, not four ─────────────────────────────────────────────────
// This used to ask for a boat as a third step, and offer a number of nights on
// the results screen. Both are gone.
//
// The boat because it was a required tap that changed nothing anyone noticed: the
// server already defaults to a canoe, the difference between a canoe and a kayak
// is inside the error bars of a float-time estimate, and a mandatory step between
// "I picked two access points" and "how long is it" is a step that loses people.
// Which boat the estimate assumed is still printed on the answer.
//
// The nights because it was a planner inside a planner — a second fetch, a
// segmented control, an itinerary, and a whole class of "the stretch has fewer
// camps than you asked for" copy — sitting under a question most people opened
// the app to ask about a Saturday afternoon.
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FloatPlan, MapAccessPoint } from '@eddy/types';
import { ApiError, fetchFloatPlan } from '@/api/client';

export type PlanStep = 'put-in' | 'take-out' | 'result';

export interface FloatPlanState {
  step: PlanStep;
  putIn: MapAccessPoint | null;
  takeOut: MapAccessPoint | null;
  plan: FloatPlan | null;
  calculating: boolean;
  error: string | null;
  /** Points ordered headwaters-first — the order a float actually happens in. */
  putInOptions: MapAccessPoint[];
  /** Only what is downstream of the chosen put-in. Empty until one is chosen. */
  takeOutOptions: MapAccessPoint[];
  choosePutIn: (point: MapAccessPoint) => void;
  chooseTakeOut: (point: MapAccessPoint) => void;
  goToStep: (step: PlanStep) => void;
  reset: () => void;
}

export function useFloatPlan(riverId: string | null, accessPoints: MapAccessPoint[]): FloatPlanState {
  const [step, setStep] = useState<PlanStep>('put-in');
  const [putIn, setPutIn] = useState<MapAccessPoint | null>(null);
  const [takeOut, setTakeOut] = useState<MapAccessPoint | null>(null);
  const [plan, setPlan] = useState<FloatPlan | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The request cannot currently be cancelled at the API boundary, so a small
  // generation guard prevents an old river's late response from becoming the
  // new river's plan.
  const calculationId = useRef(0);

  // Changing river invalidates everything: an access point belongs to exactly
  // one river, and a half-built plan carried across would pair two rivers'
  // points into a segment the server cannot resolve.
  useEffect(() => {
    calculationId.current += 1;
    setStep('put-in');
    setPutIn(null);
    setTakeOut(null);
    setPlan(null);
    setCalculating(false);
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
    async (start: MapAccessPoint, end: MapAccessPoint) => {
      if (!riverId) return;
      const requestId = ++calculationId.current;
      setCalculating(true);
      setError(null);
      setStep('result');
      try {
        const result = await fetchFloatPlan({ riverId, startId: start.id, endId: end.id });
        if (calculationId.current === requestId) setPlan(result);
      } catch (err) {
        if (calculationId.current !== requestId) return;
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
        if (calculationId.current === requestId) setCalculating(false);
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

  // The take-out is the last thing anyone has to say. Picking one goes straight
  // to the answer rather than through a boat nobody wanted to choose.
  const chooseTakeOut = useCallback(
    (point: MapAccessPoint) => {
      setTakeOut(point);
      setPlan(null);
      if (putIn) void calculate(putIn, point);
    },
    [putIn, calculate],
  );

  const reset = useCallback(() => {
    calculationId.current += 1;
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
    plan,
    calculating,
    error,
    putInOptions,
    takeOutOptions,
    choosePutIn,
    chooseTakeOut,
    goToStep: setStep,
    reset,
  };
}
