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

/** A compact label for the selected historical release-size group. */
export function sizePhrase(index: number, bands: number): string {
  return index >= bands - 1 ? `${index + 1}+ generators` : `${index + 1} generator${index === 0 ? '' : 's'}`;
}

/** The study scores once this many estimates have been compared (protocol_forward.json). */
export const RESULTS_NEEDED = 60;

/** Collection progress is not an accuracy score or a passing verdict. */
export function studyProgress(compared: number): string {
  return `${compared < RESULTS_NEEDED ? 'Early results' : 'Recent results'} · ${compared} release${compared === 1 ? '' : 's'} checked`;
}

/** Display a rough difference, not minute-level accuracy from 15-minute readings. */
export function riseDifference(estimateAt: string, roseAt: string): string {
  const delta = Date.parse(roseAt) - Date.parse(estimateAt);
  if (delta === 0) return 'At the estimated time';
  const amount = Math.abs(delta) < 5 * 60_000 ? 'Less than 5 min' : `About ${elapsedText(Math.abs(delta) / 3_600_000)}`;
  return `${amount} ${delta < 0 ? 'earlier' : 'later'} than estimated`;
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
  const compared = (results?.results ?? []).filter((r): r is Extract<PublicResult, { kind: 'compared' }> => r.kind === 'compared');
  const first = compared.at(-1);
  const entries: LogEntry[] = [
    { when: 'Nov 12, 2026', text: `Measured ${findings.scored.toLocaleString('en-US')} releases from ${findings.years[0]} to ${findings.years[1]}.` },
    {
      when: 'Nov 12, 2026',
      text: 'Tested a formula on 2022 to 2024. It landed within two hours about 9 times in 10, but about 1 in 10 arrived more than two hours early, mostly on a high river. A stricter rule on 2019 to 2021 applied to only 39 releases, too few to judge.',
    },
    { when: 'Nov 13, 2026', text: 'Started collecting estimates before each rise, then checking them against the gauge.' },
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
  const latest = compared[0];
  if (latest && latest !== first) {
    const { position, outsideMinutes } = comparison(latest);
    entries.push({
      when: datedDay(Date.parse(latest.roseAt)),
      text: position === 'inside'
        ? 'Latest comparison: the gauge rose inside the estimated window.'
        : `Latest comparison: the gauge rose ${durationText(outsideMinutes)} ${position} the estimated window.`,
    });
  }
  entries.push({ when: 'Next', text: 'Test releases that start slowly. The current rule doesn’t include them.' });
  return entries;
}
