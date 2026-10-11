// eddy-ios/src/lib/planRequest.ts
// A one-time id for "open the planner" handoffs to the Map tab.
//
// Other screens open the planner by pushing the Map tab with openPlan params.
// The tab navigator keeps the params it was last pushed with and hands them
// back on every later tab press, even after the Map screen has cleared its
// own copy, so the planner reopened on each visit. Each request now carries
// an id, and the Map tab acts on an id once.

let counter = 0;

export function newPlanRequest(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}
