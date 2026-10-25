export interface PickupContact { name: string; phone: string }
export const PICKUP_CONTACT_KEY = 'eddy.pickupContact.v1';
export function normalizePickupContact(value: PickupContact): PickupContact | null {
  const phone = value.phone.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(phone)) return null;
  return { name: value.name.trim().slice(0, 80), phone };
}
export function createPickupContactStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }) {
  let revision = 0;
  let writes = Promise.resolve();
  return {
    revision: () => revision,
    async read(): Promise<PickupContact | null> {
      const raw = await storage.getItem(PICKUP_CONTACT_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return typeof value?.name === 'string' && typeof value?.phone === 'string' ? normalizePickupContact(value) : null;
    },
    save(value: PickupContact | null, expectedRevision: number): Promise<void> {
      const normalized = value ? normalizePickupContact(value) : null;
      if (value && !normalized) return Promise.reject(new Error('Invalid phone number'));
      const task = writes.catch(() => {}).then(async () => {
        if (revision !== expectedRevision) throw new Error('Contact was cleared');
        if (normalized) await storage.setItem(PICKUP_CONTACT_KEY, JSON.stringify(normalized));
        else await storage.removeItem(PICKUP_CONTACT_KEY);
      });
      writes = task;
      return task;
    },
    clear(): Promise<void> {
      revision++;
      const task = writes.catch(() => {}).then(() => storage.removeItem(PICKUP_CONTACT_KEY));
      writes = task;
      return task;
    },
  };
}
