// Validation for the access-point fields the public Facilities section shows
// but no admin screen could edit: fee notes and the amenity chips.

/** Amenity keys in use; the public page turns a key into its label. */
export const ACCESS_POINT_AMENITIES = [
  { value: 'parking', label: 'Parking' },
  { value: 'restrooms', label: 'Restrooms' },
  { value: 'boat_ramp', label: 'Boat ramp' },
  { value: 'camping', label: 'Camping' },
  { value: 'picnic', label: 'Picnic area' },
  { value: 'store', label: 'Store' },
] as const;

export const MAX_FEE_NOTES_LENGTH = 500;
const AMENITY_KEY = /^[a-z][a-z0-9_]{1,39}$/;

/** Fee notes: trimmed text, or null to clear. `undefined` means invalid. */
export function parseFeeNotes(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > MAX_FEE_NOTES_LENGTH ? undefined : text || null;
}

/**
 * Amenities: a list of lowercase keys, deduplicated, in the order given. Keys
 * outside the known list are allowed (older rows carry them) but must look
 * like keys, so free text can never be published as a chip.
 */
export function parseAmenities(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 20) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !AMENITY_KEY.test(item)) return undefined;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}
