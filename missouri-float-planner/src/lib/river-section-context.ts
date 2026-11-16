import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

/** The upper Black follows rain; the Poplar Bluff outlook follows Clearwater. */
export function outlookIsDamControlled(riverSlug: string, siteId: string | null | undefined, controllingDamId: string | null) {
  return controllingDamId != null || Boolean(siteId && Object.values(USACE_DAMS).some(dam =>
    dam.tailwater?.riverSlug === riverSlug && dam.tailwater.gaugeSiteId === siteId));
}
