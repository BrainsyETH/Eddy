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

/** A native answer that never comes reads as "cannot confirm", not a spinner. */
const STATUS_TIMEOUT_MS = 8_000;

export async function readStylePackStatus(styleURL: string): Promise<StylePackStatus | null> {
  if (!native) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      native.status(styleURL),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn('[EddyStylePack] status did not answer in time');
          resolve(null);
        }, STATUS_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
