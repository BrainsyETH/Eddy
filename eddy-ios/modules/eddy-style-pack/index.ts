// eddy-ios/modules/eddy-style-pack/index.ts
// Whether the offline map style is complete on this phone (ADR 0011).
//
// Optional on purpose: a binary built before this module, Expo Go, or any
// failure reads as unconfirmed, so a trip is never called Ready offline
// without the evidence. Native resolves null only for a style the store
// confirms it does not have, and rejects when it cannot read the store
// (`read-failed` in src/lib/stylePackRead.ts).

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { inspectStylePack } from '../../src/lib/stylePackRead';

export interface StylePackStatus {
  requiredResourceCount: number;
  completedResourceCount: number;
}

interface NativeStylePack {
  status(styleURL: string): Promise<StylePackStatus | null>;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeStylePack>('EddyStylePack') : null;

export function readStylePackInspection(styleURL: string) {
  return inspectStylePack(native ? () => native.status(styleURL) : null);
}

export async function readStylePackStatus(styleURL: string): Promise<StylePackStatus | null> {
  const result = await readStylePackInspection(styleURL);
  return result.kind === 'counts' ? result.counts : null;
}
