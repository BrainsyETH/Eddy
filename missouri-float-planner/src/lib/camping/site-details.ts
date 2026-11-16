import sanitizeHtml from 'sanitize-html';
import type { CampsiteDetails, CampsiteFactKey } from '../../../shared/campsite-details';

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value.replace(/<\/(?:p|li|div)>|<br\s*\/?\s*>/gi, ' '), { allowedTags: [], allowedAttributes: {} })
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/\s+/g, ' ').trim();
}
const valueText = (value: unknown) => {
  const text = plain(value);
  return text.length <= 160 && !/^(?:n\/?a|unknown|not applicable|not specified|none|null|-)$/i.test(text) ? text : '';
};
const yes = (value: string) => /^(?:yes|y|true)$/i.test(value);
const no = (value: string) => /^(?:no|n|false)$/i.test(value);
const positive = (value: unknown, max: number) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : null;
};

/** Verified exact-site fields only. Shared showers/toilets are not site amenities. */
export function recreationSiteDetails(payload: unknown, facilityId: string, siteId: string): CampsiteDetails {
  const site = object(object(payload)?.campsite);
  if (!site || String(site.campsite_id) !== siteId || String(site.facility_id) !== facilityId || site.is_deactivated === true) {
    throw new Error('Invalid Recreation.gov site details');
  }
  const details: CampsiteDetails = { source: 'Recreation.gov', sourceUrl: `https://www.recreation.gov/camping/campsites/${siteId}`, facts: [], notes: [] };
  const attributes = new Map<string, string>();
  for (const attr of Array.isArray(site.attributes) ? site.attributes : []) {
    const item = object(attr);
    if (typeof item?.attribute_code === 'string') attributes.set(item.attribute_code, valueText(item.attribute_value));
  }
  const setting = object(site.site_details_map), equipment = object(site.equipment_details_map);
  // These are the display values used by the provider's own site page. Do not
  // merge legacy raw attributes over them (e.g. 50 vs 20/30/50 amp).
  const attr = (key: string) => {
    const display = object(setting?.[key]) ?? object(equipment?.[key]);
    return display ? valueText(display.attribute_value) : attributes.get(key) || '';
  };
  const add = (key: CampsiteFactKey, label: string, values: (string | null | undefined)[]) => {
    const value = [...new Set(values.filter((v): v is string => Boolean(v)))].join(' · ');
    if (value) details.facts.push({ key, label, value });
  };
  const shade = attr('shade');
  add('setting', 'Setting', [attr('proximity_water'), yes(shade) ? 'Shaded' : no(shade) ? 'No shade' : shade ? `${shade} shade` : '']);
  const vehicles = positive(attr('max_num_vehicles'), 100);
  add('access', 'Access', [attr('site_access'), attr('driveway_entry'), attr('driveway_surface'), vehicles ? `${vehicles} vehicle${vehicles === 1 ? '' : 's'} max` : '']);

  const equipmentNames: Record<string, string> = { tent: 'Tent', rv: 'RV', trailer: 'Trailer', 'pickup camper': 'Pickup camper', 'pop up': 'Pop-up', 'fifth wheel': 'Fifth wheel', 'caravan/camper van': 'Camper van', vehicle: 'Vehicle' };
  const allowed = (Array.isArray(site.permitted_equipment) ? site.permitted_equipment : []).flatMap(value => {
    const item = object(value);
    const name = valueText(item?.equipment_name);
    return !name || item?.is_deactivated === true ? [] : [{ name: equipmentNames[name.toLowerCase()] ?? name, length: positive(item?.max_length, 200) }];
  });
  const groups = new Map<number | null, string[]>();
  for (const item of allowed) {
    // Vehicle repeats an RV's identical fit limit; keep it when it's the only
    // vehicle type or has a different limit, never infer equipment permission.
    if (item.name === 'Vehicle' && allowed.some(other => other.name !== 'Tent' && other.name !== 'Vehicle' && other.length === item.length)) continue;
    const names = groups.get(item.length) ?? [];
    if (!names.includes(item.name)) names.push(item.name);
    groups.set(item.length, names);
  }
  add('equipment', 'Equipment', [...groups].map(([length, names]) => `${names.join(', ')}${length ? ` up to ${length} ft` : ''}`));

  const amenityNames: Record<string, string> = { 'picnic tables': 'Picnic table', 'picnic table': 'Picnic table', 'campfire rings': 'Fire ring', 'fire pit': 'Fire pit', 'lantern posts': 'Lantern post', 'lantern pole': 'Lantern post', 'grills': 'Grill', 'grill': 'Grill', 'food storage locker': 'Food storage locker' };
  const amenities = (Array.isArray(site.amenities) ? site.amenities : []).flatMap(value => {
    const item = object(value), name = valueText(item?.attribute_name).toLowerCase();
    const provided = valueText(item?.attribute_value);
    return amenityNames[name] && provided && !no(provided) ? [amenityNames[name]] : [];
  });
  add('amenities', 'At this site', amenities);
  const electric = attr('electric_hookup');
  // Specific service adds information; a generic No hookup repeats the summary.
  add('hookups', 'Hookups', [/^\d+(?:\/\d+)*$/.test(electric) ? `${electric}-amp electric` : '', yes(attr('water_hookup')) ? 'Water hookup' : '', yes(attr('sewer_hookup')) ? 'Sewer hookup' : '']);
  add('arrival', 'Arrival', [attr('checkin_time') ? `In ${attr('checkin_time')}` : '', attr('checkout_time') ? `Out ${attr('checkout_time')}` : '']);
  const pets = attr('pets_allowed');
  add('pets', 'Pets', [yes(pets) ? 'Allowed' : no(pets) ? 'Not allowed' : pets]);
  if (site.is_accessible === true) add('accessibility', 'Accessibility', ['Listed as accessible']);
  details.notes = [...new Set((Array.isArray(site.notices) ? site.notices : []).flatMap(value => {
    const note = object(value);
    const text = note?.active === true ? plain(note.notice_text) : '';
    return text ? [text] : [];
  }))];
  return details;
}

export async function fetchRecreationSiteDetails(facilityId: string, siteId: string, request: typeof fetch = fetch): Promise<CampsiteDetails> {
  if (!/^\d+$/.test(facilityId) || !/^\d+$/.test(siteId)) throw new Error('Invalid Recreation.gov ID');
  const response = await request(`https://www.recreation.gov/api/camps/campsites/${siteId}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error('Site details unavailable');
  return recreationSiteDetails(await response.json(), facilityId, siteId);
}
