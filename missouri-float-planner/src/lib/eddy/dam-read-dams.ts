// src/lib/eddy/dam-read-dams.ts
// Which dams get a written Read. Its own module so the client dam page can ask
// without bundling the facts and prose checks in dam-read-facts.ts.
//
// The White River trout tailwaters, where wading timing is the question and
// the turbine history is near-complete since 2026-08-07. Widening is a list
// edit, but a deliberate one: ADR 0017 records why the pilot is these five.

export const DAM_READ_DAM_IDS = [
  'swl-table-rock-dam',
  'swl-bull-shoals-dam',
  'swl-norfork-dam',
  'swl-beaver-dam',
  'swl-greers-ferry-dam',
] as const;

export function damHasRead(damId: string): boolean {
  return (DAM_READ_DAM_IDS as readonly string[]).includes(damId);
}
