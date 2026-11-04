import type { FloatReminderChoices } from './floatReminders';

/** Describe this stretch without changing the person's saved reminder preferences. */
export function tripOptionsSummary(value: FloatReminderChoices, hazards: number | null): string {
  const hazardReminders = value.hazards !== false && hazards !== 0;
  if (value.takeOut) return hazardReminders ? 'Take-out and hazard reminders' : 'Take-out reminder';
  if (hazardReminders) return 'Hazard reminders';
  return hazards === 0 && value.hazards !== false ? 'No reminders for this stretch' : 'Reminders off';
}
