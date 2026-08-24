// scripts/negative-evidence.ts
// What "no businesses exist there" is allowed to mean, and what has to be
// recorded before anyone may write it down.
//
// ── WHY ────────────────────────────────────────────────────────────────────
//
// Three corridor passes in this branch ended in a negative result: the
// St. Francis whitewater reach has no commercial outfitter, the lower Gasconade
// has none below Vienna, and the Missouri Spring River has none at all. Those
// are useful findings — a coverage table showing 0 invites the next person to
// spend a day rediscovering them — but as prose they are unfalsifiable. A
// reader cannot tell whether "none found" meant an afternoon or ten minutes,
// which directories were consulted, or when.
//
// ── THE DISTINCTION THAT MATTERS ───────────────────────────────────────────
//
// Two negatives of very different strength kept getting the same word.
//
//   AUTHORITATIVE ROSTER — somebody publishes the list of who is permitted to
//   operate. NPS names its authorized Buffalo concessioners; the Forest Service
//   names its Eleven Point ones. Absence from that roster is close to proof,
//   and "complete" is a fair word. It is still only as good as the roster: the
//   USFS list for the Eleven Point names three, one of which is a Virginia
//   company on the Shenandoah.
//
//   SEARCH EXHAUSTION — no roster exists and the claim rests on having looked.
//   The Bourbeuse and the Missouri Spring River are this. The strongest honest
//   phrasing is "none found as of <date>", never "there are none", and the
//   record has to say where you looked so somebody can look somewhere else.
//
// A record that claims a roster must cite it. That is the one rule here with
// teeth, because it is the difference between the two.

export type EvidenceBasis = 'authoritative_roster' | 'search_exhaustion';

export interface NegativeEvidence {
  /** What is being claimed to be absent — usually a service type or all of them. */
  scope: string;
  basis: EvidenceBasis;
  /** ISO date the search was actually performed. */
  checkedAt: string;
  /** The roster URL. Required when basis is authoritative_roster. */
  roster?: string;
  /** Directories, agency indexes and tourism sites actually consulted. */
  directories: string[];
  /** The search phrasings tried, so a reader can tell what was not tried. */
  queryVariants: string[];
  /** The stretch of river or the counties the claim covers. */
  bounds: string;
  /** Named honestly: what would strengthen this and was not done. */
  notAttempted: string[];
  note?: string;
}

export type EvidenceFile = Record<string, NegativeEvidence>;

/** How long a negative stays worth believing before somebody should re-look. */
export const EVIDENCE_STALE_DAYS = 365;

export function evidenceProblems(slug: string, e: NegativeEvidence, today: Date): string[] {
  const problems: string[] = [];
  const say = (m: string) => problems.push(`${slug}: ${m}`);

  if (!e.scope) say('has no scope — say what is claimed to be absent');
  if (e.basis !== 'authoritative_roster' && e.basis !== 'search_exhaustion') {
    say(`basis "${e.basis}" is neither authoritative_roster nor search_exhaustion`);
  }
  // The rule with teeth. A roster claim without the roster is just an
  // exhaustion claim wearing a stronger word.
  if (e.basis === 'authoritative_roster' && !e.roster) {
    say('claims an authoritative roster but does not cite one');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checkedAt)) {
    say('checkedAt must be YYYY-MM-DD');
  } else {
    const when = new Date(`${e.checkedAt}T00:00:00Z`);
    if (Number.isNaN(when.getTime()) || when.toISOString().slice(0, 10) !== e.checkedAt) {
      say(`checkedAt ${e.checkedAt} is not a real calendar date`);
    } else {
      const days = (today.getTime() - when.getTime()) / 86_400_000;
      if (days < -1) say('checkedAt is in the future');
      else if (days > EVIDENCE_STALE_DAYS) {
        say(`was checked ${Math.round(days)} days ago — re-look before quoting it`);
      }
    }
  }
  if (e.directories.length === 0) say('lists no directories consulted');
  if (e.basis === 'search_exhaustion' && e.queryVariants.length < 2) {
    say('rests on searching but records fewer than two query variants');
  }
  if (!e.bounds) say('does not say what stretch or counties the claim covers');
  return problems;
}

/**
 * The phrasing a river's coverage is allowed to use. Everything downstream
 * should quote this rather than inventing its own wording, because the whole
 * point is that the two bases do not deserve the same sentence.
 */
export function evidencePhrasing(e: NegativeEvidence): string {
  return e.basis === 'authoritative_roster'
    ? `complete against the published roster as of ${e.checkedAt}`
    : `none found as of ${e.checkedAt}`;
}
