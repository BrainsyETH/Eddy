export const PUSH_OPT_OUT_KEY = 'eddy.push.device-opt-out.v1';

export interface PushOptOutStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function deviceStorage(): PushOptOutStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as PushOptOutStorage;
}

export async function isDeviceOptedOut(storage: PushOptOutStorage = deviceStorage()): Promise<boolean> {
  try {
    return (await storage.getItem(PUSH_OPT_OUT_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setDeviceOptedOut(
  optedOut: boolean,
  storage: PushOptOutStorage = deviceStorage(),
): Promise<void> {
  try {
    if (optedOut) await storage.setItem(PUSH_OPT_OUT_KEY, 'true');
    else await storage.removeItem(PUSH_OPT_OUT_KEY);
  } catch {
    // Registration remains non-fatal; the server unregister can still run.
  }
}
