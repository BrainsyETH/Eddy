import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';
import { env } from '@/lib/env';

export async function downloadRiverCorridor(
  riverSlug: string,
  bounds: [number, number, number, number],
  onProgress: (percentage: number) => void,
): Promise<OfflinePack> {
  if (!env.offlineStyleUrl) {
    throw new Error('Offline maps are disabled until an Eddy-owned tile source is configured');
  }
  return OfflineManager.createPack({
    mapStyle: env.offlineStyleUrl,
    minZoom: 6,
    maxZoom: 14,
    bounds,
    metadata: { name: riverSlug, riverSlug },
  }, (_pack, status) => onProgress(status.percentage), (_pack, error) => {
    console.warn('[OfflineMap]', error.message);
  });
}
