import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { floatShareState, shareDuration } from '@eddy/conditions/float-share';
import { recapMeasurements } from './floatHistoryDisplay';

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

export function shareTextLines(text: string, limit = 28, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= limit) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  const shown = lines.slice(0, maxLines).map(line => line.length > limit ? line.slice(0, limit - 1) + '…' : line);
  if (lines.length > maxLines) shown[maxLines - 1] = shown[maxLines - 1].slice(0, limit - 1) + '…';
  return shown;
}

