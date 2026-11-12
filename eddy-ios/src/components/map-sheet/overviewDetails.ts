import type { NearbyService } from '@eddy/types';
import { stripHtml } from '../../lib/accessCopy';

/** Keep every word and restriction; only add reading breaks, never summarize. */
export function accessNoteItems(value: string | null | undefined): string[] {
  const text = stripHtml(value);
  if (!text) return [];
  return text.split(/\n+/).flatMap((paragraph) => {
    const parts = paragraph.trim().replace(/^•\s*/, '').split(/(?<=[.!?])\s+(?=[A-Z])/);
    const items: string[] = [];
    for (const part of parts) {
      const previous = items[items.length - 1];
      // Sentence-like punctuation inside initials, units and place names is
      // not a new tip (U.S. Forest Service, Hwy. 19, St. Louis, 6 ft. Falls).
      if (previous && /\b(?:[A-Z]|U\.S|Mr|Mrs|Ms|Dr|St|Mt|Rd|Hwy|No|approx|ft|mi)\.$/i.test(previous)) {
        items[items.length - 1] += ` ${part}`;
      } else if (part) {
        items.push(part);
      }
    }
    return items;
  });
}

/** Old payloads remain nearby; names and distances never establish identity. */
export function campingServiceGroups(services: readonly NearbyService[]) {
  return {
    here: services.filter((service) => service.relationship === 'same_place'),
    nearby: services.filter((service) => service.relationship !== 'same_place'),
  };
}
