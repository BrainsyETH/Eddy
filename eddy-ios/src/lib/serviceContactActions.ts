export interface ServiceContactAction {
  label: string;
  url: string;
}

/** Each available contact method is independent; a phone must not hide a site. */
export function serviceContactActions(service: {
  phone?: string | null;
  website?: string | null;
  reservationUrl?: string | null;
}): ServiceContactAction[] {
  const actions: ServiceContactAction[] = [];
  const phone = service.phone?.trim();
  if (phone && /\d/.test(phone)) {
    actions.push({ label: 'Call', url: `tel:${phone.replace(/[^\d+]/g, '')}` });
  }
  for (const [label, value] of [['Website', service.website], ['Book', service.reservationUrl]] as const) {
    const raw = value?.trim();
    if (!raw) continue;
    const url = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') actions.push({ label, url });
    } catch { /* A malformed contact must not become a dead action. */ }
  }
  return actions;
}
