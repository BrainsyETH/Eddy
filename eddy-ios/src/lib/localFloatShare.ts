import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { floatShareState, shareDuration } from '@eddy/conditions/float-share';
import { recapMeasurements } from './floatHistoryDisplay';
export { shareTextLines } from '@eddy/conditions/float-share-layout';

/** Local export has no condition stamp, precise times, coordinates, account or start note. */
export function localFloatShare(trip: CompletedFloat) {
  const state = floatShareState(trip);
  const distance = recapMeasurements(trip).distance;
  return {
    river: trip.riverName, from: trip.putInName ?? 'Started on the river', to: trip.takeOutName,
    date: state.date, duration: shareDuration(state.minutes),
    distance: distance ? `${distance.value} ${distance.unit}` : null,
    tracking: state.tracking === 'none' ? 'GPS tracking unavailable'
      : state.tracking === 'partial' ? 'Limited GPS tracking' : null,
    arrival: trip.reachedTakeOut ? 'Reached the take-out' : 'Take-out wasn’t confirmed',
  };
}
