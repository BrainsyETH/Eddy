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
  | { type: 'change' | 'validate'; patch: Partial<PlannerSelection> }
  | { type: 'undo' };

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
