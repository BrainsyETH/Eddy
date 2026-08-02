// src/lib/data/dam-grouping.ts
// How the /dams index is divided into sections.
//
// This is a pure function rather than inline JSX because the index page is a
// React Server Component, and an RSC cannot be unit tested — the previous
// version hardcoded `filter(d => d.state === 'MO')` and `'AR'` in the page
// body, which was correct for exactly as long as Eddy had only Missouri and
// Arkansas dams. Adding the ten SWPA projects put eight dams in Oklahoma and
// Texas, and they would have rendered in neither section: present in /api/dams
// and at /dams/[damId], invisible on the index.
//
// Two rules, both about what a reader is scanning for:
//
// 1. HOME STATES FIRST. Missouri and Arkansas lead because that is where every
//    river Eddy carries is, so those dams are the ones with a float below them.
//    The rest follow alphabetically by state name, not by code.
// 2. NAVIGATION DAMS LAST, TOGETHER. The four Arkansas River locks & dams are
//    run-of-river barge pools. Their generation schedules are as real as any
//    other — Dardanelle is a 148 MW plant — but nobody plans a float below one,
//    and leaving them interleaved with Beaver and Bull Shoals would push the
//    dams people actually want below the fold.

import { stateName } from '@/lib/navigation/states';
import type { DamSnapshot } from '@shared/dam-types';

/** States listed before everything else, in this order. */
const HOME_STATES = ['MO', 'AR'];

/**
 * Navigation lock & dam ids, grouped apart from the reservoirs.
 *
 * Listed explicitly rather than sniffed from the name: "Lock & Dam" in a title
 * is a naming convention, and a convention is not a fact to branch on.
 */
const NAVIGATION_DAM_IDS = new Set([
  'swt-robert-s-kerr-dam',
  'swt-webbers-falls-dam',
  'swl-ozark-dam',
  'swl-dardanelle-dam',
]);

const NAVIGATION_LABEL = 'Arkansas River locks & dams';

export interface DamGroup {
  label: string;
  dams: DamSnapshot[];
}

export function isNavigationDam(damId: string): boolean {
  return NAVIGATION_DAM_IDS.has(damId);
}

/**
 * Group dams for the index. Empty groups are omitted, so a source outage that
 * drops a whole state's dams removes its heading rather than leaving an empty
 * one behind.
 */
export function groupDamsForIndex(dams: DamSnapshot[]): DamGroup[] {
  const reservoirs = dams.filter((d) => !isNavigationDam(d.id));
  const navigation = dams.filter((d) => isNavigationDam(d.id));

  const byState = new Map<string, DamSnapshot[]>();
  for (const dam of reservoirs) {
    const list = byState.get(dam.state);
    if (list) list.push(dam);
    else byState.set(dam.state, [dam]);
  }

  const codes = [...byState.keys()].sort((a, b) => {
    const ai = HOME_STATES.indexOf(a);
    const bi = HOME_STATES.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      // A home state always precedes a non-home one; two home states keep the
      // order they are declared in.
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return stateName(a).localeCompare(stateName(b));
  });

  const groups: DamGroup[] = codes.map((code) => ({
    label: stateName(code),
    dams: byState.get(code)!,
  }));

  if (navigation.length > 0) groups.push({ label: NAVIGATION_LABEL, dams: navigation });

  return groups.filter((g) => g.dams.length > 0);
}
