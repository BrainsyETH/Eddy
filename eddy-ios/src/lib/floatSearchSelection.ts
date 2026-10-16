import type { FloatSearchInput } from '@eddy/conditions/float-search';

/** A delayed GPS answer must never replace a river, town, or an in-progress choice. */
export function canDefaultToCurrentLocation(
  input: Pick<FloatSearchInput, 'river' | 'near'>,
  status: string,
  hasChosen: boolean,
): boolean {
  return !hasChosen && !input.river && !input.near && status === 'ready';
}

/** A river search must not inherit a hidden location from an earlier nearby search. */
export function selectSearchRiver(river: string): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river, near: undefined };
}
export function selectSearchLocation(
  near: NonNullable<FloatSearchInput['near']>,
): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river: undefined, near };
}
