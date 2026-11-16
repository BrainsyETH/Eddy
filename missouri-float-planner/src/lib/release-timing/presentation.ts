// Display-only helpers; study estimates and scoring stay unchanged.
import { comparison, type PublicResult, type PublicResults } from '../arrival-trial/public-results';
import { hoursText, type Findings } from './findings';
import { datedDay, durationText } from './time';

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

/**
 * "about 5 hours": a time at a place with no gauge, to the nearest half hour.
 * Nothing there was measured, so it gets no window and no minutes.
 */
export function roughHours(hours: number): string {
  const halves = Math.max(1, Math.round(hours * 2));
  return halves === 1 ? 'about half an hour' : halves === 2 ? 'about 1 hour' : `about ${hoursText(halves / 2)} hours`;
}

/** "A 4-generator release" / "A release of 5 or more generators". */
export function sizePhrase(index: number, bands: number): string {
  return index >= bands - 1 ? `A release of ${index + 1} or more generators` : `A ${index + 1}-generator release`;
}

/** The study scores once this many estimates have been compared (protocol_forward.json). */
export const RESULTS_NEEDED = 60;

export type Slot = 'inside' | 'outside' | 'open';
/** One slot per result the study needs, oldest first: filled as estimates are compared. */
export function progressSlots(results: PublicResults | null): Slot[] {
  const compared = (results?.results ?? []).filter((r): r is Extract<PublicResult, { kind: 'compared' }> => r.kind === 'compared').reverse();
  const filled: Slot[] = compared.slice(0, RESULTS_NEEDED).map((r) => (comparison(r).position === 'inside' ? 'inside' : 'outside'));
  return [...filled, ...Array<Slot>(Math.max(0, RESULTS_NEEDED - filled.length)).fill('open')];
}

export interface LogEntry {
  when: string;
  text: string;
}
/**
 * The study so far, oldest first, ending with what comes next. Fixed entries are
 * dated from the study's own records; the first live result is read from the
 * results, so it appears on its own when the river gives one.
 */
export function researchLog(findings: Findings, results: PublicResults | null): LogEntry[] {
  const first = (results?.results ?? []).filter((r): r is Extract<PublicResult, { kind: 'compared' }> => r.kind === 'compared').at(-1);
  const entries: LogEntry[] = [
    { when: 'Nov 12, 2026', text: `Measured ${findings.scored.toLocaleString('en-US')} releases from ${findings.years[0]} to ${findings.years[1]}.` },
    {
      when: 'Nov 12, 2026',
      text: 'Tested a formula on 2022 to 2024. It landed within two hours about 9 times in 10, but about 1 in 10 arrived more than two hours early, mostly on a high river. A stricter rule on 2019 to 2021 applied to only 39 releases, too few to judge.',
    },
    { when: 'Nov 13, 2026', text: 'Started the live test. Eddy saves an estimate at each release, before the river answers, and checks the gauge a day later.' },
  ];
  if (first) {
    const { position, outsideMinutes } = comparison(first);
    entries.push({
      when: datedDay(Date.parse(first.roseAt)),
      text: position === 'inside'
        ? 'First result: the gauge rose inside the estimated window.'
        : `First result: the gauge rose ${durationText(outsideMinutes)} ${position} the estimated window.`,
    });
  }
  entries.push({ when: 'Next', text: 'Releases that start slowly. The live test doesn’t count them yet, and we’re working out how to include them.' });
  return entries;
}
