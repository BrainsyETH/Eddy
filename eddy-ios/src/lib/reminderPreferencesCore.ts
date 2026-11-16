import type { FloatReminderChoices } from './floatReminders';

export const REMINDER_PREFERENCES_KEY = 'eddy.reminderPreferences.v1';
export function reminderPreferences(raw: string | null): FloatReminderChoices {
  try {
    const value = JSON.parse(raw ?? '{}');
    return { takeOut: typeof value.takeOut === 'boolean' ? value.takeOut : true,
      hazards: typeof value.hazards === 'boolean' ? value.hazards : true, stops: [] };
  } catch { return { takeOut: true, hazards: true, stops: [] }; }
}

/** Device preferences only. A river's selected stops never become another float's defaults. */
export function createReminderPreferences(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}) {
  let generation = 0;
  let writes = Promise.resolve();
  return {
    revision: () => generation,
    read: async () => reminderPreferences(await storage.getItem(REMINDER_PREFERENCES_KEY)),
    save(value: FloatReminderChoices, revision: number) {
      const task = writes.catch(() => {}).then(async () => {
        if (revision !== generation) return;
        await storage.setItem(REMINDER_PREFERENCES_KEY, JSON.stringify({ takeOut: value.takeOut, hazards: value.hazards !== false }));
      });
      writes = task;
      return task;
    },
    clear() {
      generation++;
      const task = writes.catch(() => {}).then(() => storage.removeItem(REMINDER_PREFERENCES_KEY));
      writes = task;
      return task;
    },
  };
}
