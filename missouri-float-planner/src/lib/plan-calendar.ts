// src/lib/plan-calendar.ts
// Turn a float plan into a calendar event (.ics) and an email draft — the
// planner's return path. A plan in someone's calendar or inbox brings them
// back to re-check conditions the morning of the float.

interface FloatPlanEventInput {
  riverName: string;
  putInName: string;
  takeOutName: string;
  /** Shareable plan URL (query-string planner link). */
  url: string;
  /** Estimated float minutes (upper bound preferred); defaults to 4h. */
  minutes?: number | null;
  distanceLabel?: string | null;
}

// RFC 5545 text escaping.
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Upcoming Saturday (today if it IS Saturday), 9:00 local — floating time,
 *  so the event is 9am wherever the paddler's calendar lives. */
function upcomingSaturdayAt9(): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  const dow = d.getDay(); // 6 = Saturday
  const daysUntilSat = (6 - dow + 7) % 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d;
}

function icsLocalStamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

export function buildFloatPlanIcs(input: FloatPlanEventInput): string {
  const start = upcomingSaturdayAt9();
  const minutes = Math.max(60, Math.round(input.minutes ?? 240));
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  const summary = `Float ${input.riverName}: ${input.putInName} → ${input.takeOutName}`;
  const descriptionParts = [
    `Put-in: ${input.putInName}`,
    `Take-out: ${input.takeOutName}`,
    input.distanceLabel ? `Distance: ${input.distanceLabel}` : null,
    `Check live conditions before you go: ${input.url}`,
  ].filter(Boolean) as string[];

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eddy//Float Planner//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.floor(Math.random() * 1e6)}@eddy.guide`,
    `DTSTAMP:${icsLocalStamp(new Date())}`,
    `DTSTART:${icsLocalStamp(start)}`,
    `DTEND:${icsLocalStamp(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(descriptionParts.join('\n'))}`,
    `LOCATION:${icsEscape(`${input.putInName}, ${input.riverName}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Trigger a client-side download of the plan as a .ics file. */
export function downloadFloatPlanIcs(input: FloatPlanEventInput): void {
  const blob = new Blob([buildFloatPlanIcs(input)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `float-${input.riverName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** mailto: draft with the plan summary + link (no backend required). */
export function buildFloatPlanMailto(input: FloatPlanEventInput): string {
  const subject = `Float plan: ${input.riverName} — ${input.putInName} to ${input.takeOutName}`;
  const body = [
    `Floating the ${input.riverName}!`,
    '',
    `Put-in: ${input.putInName}`,
    `Take-out: ${input.takeOutName}`,
    input.distanceLabel ? `Distance: ${input.distanceLabel}` : null,
    '',
    `Plan + live conditions: ${input.url}`,
  ]
    .filter((l) => l !== null)
    .join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
