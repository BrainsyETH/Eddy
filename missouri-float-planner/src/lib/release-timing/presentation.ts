// Display-only helpers; study estimates and scoring stay unchanged.
export function elapsedText(hours: number): string {
  const minutes = Math.max(0, Math.round(hours * 12) * 5);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return whole ? whole + ' hr' + (rest ? ' ' + rest + ' min' : '') : minutes + ' min';
}

export function windowPosition(elapsed: number, early: number, late: number): 'before' | 'within' | 'past' {
  return elapsed < early ? 'before' : elapsed > late ? 'past' : 'within';
}

/** A late historical observation must remain reachable by the playback controls. */
export function playbackHours(latest: number): number {
  return Math.max(24, Math.ceil(latest / 6) * 6);
}
