// eddy-ios/src/lib/planRequest.ts
// A one-time id for planner handoffs, including legacy links to the Map tab.
//
// Today and Floats push a fresh /plan-route in their own tab. Legacy Map links
// still carry openPlan params, which the tab navigator can replay after the
// screen clears its copy. Each request gets an id so a mounted planner handles
// that intent once, including when route data arrives asynchronously.

let counter = 0;

export function newPlanRequest(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

/** A fresh planner in the caller's stack; the Map tab keeps its own state. */
export function floatPlanDestination(params: Record<string, string> = {}) {
  return {
    pathname: '/plan-route' as const,
    params: { ...params, openPlan: '1', planRequest: newPlanRequest() },
  };
}
