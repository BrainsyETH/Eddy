// eddy-ios/modules/eddy-style-pack/index.ts
// Whether the offline map style is complete on this phone (ADR 0011).
//
// Optional on purpose: a binary built before this module, Expo Go, or any
// failure reads as null, which callers treat as "cannot confirm", so a trip
// is never called Ready offline without the evidence.

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface StylePackStatus {
  requiredResourceCount: number;
  completedResourceCount: number;
}

interface NativeStylePack {
  status(styleURL: string): Promise<StylePackStatus | null>;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeStylePack>('EddyStylePack') : null;

export async function readStylePackStatus(styleURL: string): Promise<StylePackStatus | null> {
  if (!native) return null;
  try {
    return await native.status(styleURL);
  } catch {
    return null;
  }
}
