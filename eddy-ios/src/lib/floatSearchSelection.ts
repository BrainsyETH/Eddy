import type { FloatSearchInput } from '@eddy/conditions/float-search';

/** A delayed GPS answer must never replace a river, town, or an in-progress choice. */
export function canDefaultToCurrentLocation(
  input: Pick<FloatSearchInput, 'river' | 'near'>,
  status: string,
  hasChosen: boolean,
): boolean {
  return !hasChosen && !input.river && !input.near && status === 'ready';
}

/** A river search must not inherit a hidden location from an earlier town
 * search. Only a visible starting point (your own location, or a chosen
 * launch) may stay, to order launches and add drive times. */
export function selectSearchRiver(
  river: string,
  visibleNear?: FloatSearchInput['near'],
): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river, near: visibleNear };
}
export function selectSearchLocation(
  near: NonNullable<FloatSearchInput['near']>,
): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river: undefined, near };
}
