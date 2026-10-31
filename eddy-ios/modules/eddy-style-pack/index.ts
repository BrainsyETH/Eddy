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
  /** Added in native revision 3; absent from older binaries. */
  diagnose?: (styleURL: string) => Promise<Record<string, string>>;
  revision?: string;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeStylePack>('EddyStylePack') : null;

/**
 * Diagnostics only (see `diagnose` in the Swift module): what the offline
 * store answers, and how fast, for the style pack and the tile regions. Says
 * so when the binary's module predates it, which itself identifies the build.
 */
export async function diagnoseStylePack(styleURL: string): Promise<Record<string, string>> {
  if (!native) return { revision: 'no native module' };
  if (typeof native.diagnose !== 'function') {
    return { revision: native.revision ?? 'before revision 3 (no diagnose in this binary)' };
  }
  try {
    return await native.diagnose(styleURL);
  } catch (error) {
    return { revision: native.revision ?? 'unknown', diagnose: `threw: ${String(error)}` };
  }
}

export function readStylePackInspection(styleURL: string) {
  return inspectStylePack(native ? () => native.status(styleURL) : null);
}

export async function readStylePackStatus(styleURL: string): Promise<StylePackStatus | null> {
  const result = await readStylePackInspection(styleURL);
  return result.kind === 'counts' ? result.counts : null;
}
