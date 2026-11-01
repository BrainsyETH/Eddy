export interface PlannerSelection {
  riverSlug: string | null;
  selectedPutIn: string | null;
  selectedTakeOut: string | null;
}

export interface PlannerSelectionHistory {
  current: PlannerSelection;
  past: PlannerSelection[];
}

type SelectionAction =
  // 'change' is a route edit (Undo-able); 'validate' and 'browse' are not.
  | { type: 'change' | 'validate' | 'browse'; patch: Partial<PlannerSelection> }
  | { type: 'undo' };

/** Preserve the planner's downstream ordering, whichever endpoint is picked first. */
export function orderedPlannerEndpoints(
  first: { id: string; riverMile: number },
  second: { id: string; riverMile: number },
): Pick<PlannerSelection, 'selectedPutIn' | 'selectedTakeOut'> {
  const [putIn, takeOut] = first.riverMile > second.riverMile ? [second, first] : [first, second];
  return { selectedPutIn: putIn.id, selectedTakeOut: takeOut.id };
}

/**
 * Which river owns the planner after inspecting a place on `placeRiver`.
 * Another river's place carries the planner with it when nothing would be
 * lost; with a route in progress elsewhere, the planner browses all rivers
 * instead, so the old river is never shown as current beside the new place.
 */
export function plannerRiverForPlace(current: PlannerSelection, placeRiver: string): 'same' | 'switch' | 'browse' {
  if (!placeRiver || placeRiver === current.riverSlug) return 'same';
  return current.selectedPutIn || current.selectedTakeOut ? 'browse' : 'switch';
}

/** Only deliberate route edits enter history; camera moves and inspection don't. */
export function plannerSelectionReducer(state: PlannerSelectionHistory, action: SelectionAction): PlannerSelectionHistory {
  if (action.type === 'undo') {
    const current = state.past.at(-1);
    return current ? { current, past: state.past.slice(0, -1) } : state;
  }
  const current = { ...state.current, ...action.patch };
  if (current.riverSlug === state.current.riverSlug
    && current.selectedPutIn === state.current.selectedPutIn
    && current.selectedTakeOut === state.current.selectedTakeOut) return state;
  return {
    current,
    past: action.type === 'change' ? [...state.past.slice(-9), state.current] : state.past,
  };
}
