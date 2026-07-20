import type { FloatPlan } from '@/types/api';

const STORAGE_KEY = 'eddy-last-valid-float-plan-v1';
const CACHE_VERSION = 1;
export const LAST_VALID_PLAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlanCacheIdentity {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId?: string;
  tripDurationDays?: number;
}

export interface CachedFloatPlan {
  version: 1;
  savedAt: number;
  identity: PlanCacheIdentity;
  plan: FloatPlan;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function samePlanIdentity(
  left: PlanCacheIdentity,
  right: PlanCacheIdentity
): boolean {
  return (
    left.riverId === right.riverId &&
    left.startId === right.startId &&
    left.endId === right.endId &&
    (left.vesselTypeId ?? '') === (right.vesselTypeId ?? '') &&
    (left.tripDurationDays ?? 1) === (right.tripDurationDays ?? 1)
  );
}

function isPlanForIdentity(plan: unknown, identity: PlanCacheIdentity): plan is FloatPlan {
  if (!plan || typeof plan !== 'object') return false;
  const candidate = plan as Partial<FloatPlan>;
  return (
    candidate.river?.id === identity.riverId &&
    candidate.putIn?.id === identity.startId &&
    candidate.takeOut?.id === identity.endId &&
    typeof candidate.distance?.miles === 'number' &&
    typeof candidate.condition?.code === 'string'
  );
}

export function readLastValidPlan(
  storage: StorageLike,
  identity: PlanCacheIdentity,
  now = Date.now()
): CachedFloatPlan | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedFloatPlan>;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt > now + 5 * 60 * 1000 ||
      now - parsed.savedAt > LAST_VALID_PLAN_MAX_AGE_MS ||
      !parsed.identity ||
      !samePlanIdentity(parsed.identity, identity) ||
      !isPlanForIdentity(parsed.plan, identity)
    ) {
      return null;
    }
    return parsed as CachedFloatPlan;
  } catch {
    return null;
  }
}

export function writeLastValidPlan(
  storage: StorageLike,
  identity: PlanCacheIdentity,
  plan: FloatPlan,
  savedAt = Date.now()
): CachedFloatPlan | null {
  if (!isPlanForIdentity(plan, identity)) return null;
  // Cached browser storage is not an authoritative content source. Rich HTML
  // is unnecessary for the field summary and is stripped so a locally
  // modified cache can never feed an executable string into admin-authored
  // `dangerouslySetInnerHTML` access-point sections.
  const safePlan: FloatPlan = {
    ...plan,
    putIn: { ...plan.putIn, localTips: null },
    takeOut: { ...plan.takeOut, localTips: null },
  };
  const cached: CachedFloatPlan = {
    version: CACHE_VERSION,
    savedAt,
    identity,
    plan: safePlan,
  };
  try {
    // Keep exactly one plan. This bounds storage even when a user explores many
    // route/vessel combinations and makes replacement behavior predictable.
    storage.setItem(STORAGE_KEY, JSON.stringify(cached));
    return cached;
  } catch {
    return null;
  }
}
