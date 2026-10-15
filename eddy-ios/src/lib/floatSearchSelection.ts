import type { FloatSearchInput } from '@eddy/conditions/float-search';

/** A river search must not inherit a hidden location from an earlier nearby search. */
export function selectSearchRiver(river: string): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river, near: undefined };
}
export function selectSearchLocation(
  near: NonNullable<FloatSearchInput['near']>,
): Pick<FloatSearchInput, 'river' | 'near'> {
  return { river: undefined, near };
}
