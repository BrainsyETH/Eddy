export interface VesselType { id: string; slug: string }

/** One shared request per session. A failed request can be retried. */
export function vesselTypeLoader(load: () => Promise<{ vesselTypes: VesselType[] }>) {
  let pending: Promise<VesselType[]> | null = null;
  return () => {
    if (!pending) pending = load().then(result => result.vesselTypes).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
