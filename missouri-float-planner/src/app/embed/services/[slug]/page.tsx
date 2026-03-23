'use client';

// src/app/embed/services/[slug]/page.tsx
// Embeddable services directory widget for displaying outfitters, campgrounds,
// and lodging for a river. Designed for outfitter and campground websites.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

// Service offering labels
const SERVICE_LABELS: Record<string, string> = {
  canoe_rental: 'Canoes',
  kayak_rental: 'Kayaks',
  raft_rental: 'Rafts',
  tube_rental: 'Tubes',
  jon_boat_rental: 'Jon Boats',
  shuttle: 'Shuttle',
  camping_primitive: 'Camping',
  camping_rv: 'RV Sites',
  cabins: 'Cabins',
  lodge_rooms: 'Lodge',
  general_store: 'Store',
  food_service: 'Food',
  showers: 'Showers',
  fishing_supplies: 'Fishing',
  horseback_riding: 'Horseback',
  swimming_pool: 'Pool',
  wifi: 'WiFi',
};

// Type display config
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  outfitter: { label: 'Outfitter', color: '#2563eb', icon: '🛶' },
  campground: { label: 'Campground', color: '#059669', icon: '⛺' },
  cabin_lodge: { label: 'Cabin & Lodge', color: '#d97706', icon: '🏠' },
};

interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  phone: string | null;
  phoneTollFree: string | null;
  email: string | null;
  website: string | null;
  city: string;
  state: string;
  description: string | null;
  servicesOffered: string[];
  seasonalNotes: string | null;
  npsAuthorized: boolean;
  usfsAuthorized: boolean;
  status: string;
  isNpsCampground?: boolean;
  reservationUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface RiverBasic {
  name: string;
  slug: string;
}

export default function EmbedServicesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const typeFilter = searchParams.get('type') || '';
  const excludeFilter = searchParams.get('exclude') || '';
  const highlightParam = searchParams.get('highlight') || '';
  const highlightSlugs = highlightParam ? highlightParam.split(',').map(s => s.trim()).filter(Boolean) : [];
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [servicesRes, riversRes] = await Promise.all([
          fetch(`/api/rivers/${slug}/services`),
          fetch('/api/rivers'),
        ]);

        if (riversRes.ok) {
          const data = await riversRes.json();
          const found = data.rivers?.find((r: RiverBasic & { id: string }) => r.slug === slug);
          if (found) setRiver(found);
        }

        if (servicesRes.ok) {
          const data = await servicesRes.json();
          let items: ServiceItem[] = data.services || [];
          // Filter by status
          items = items.filter(s => s.status === 'active' || s.status === 'seasonal');
          // Filter by type (include) or exclude
          if (typeFilter) {
            items = items.filter(s => s.type === typeFilter);
          } else if (excludeFilter) {
            const excludeTypes = excludeFilter.split(',').map(t => t.trim());
            items = items.filter(s => !excludeTypes.includes(s.type));
          }
          setServices(items);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug, typeFilter, excludeFilter]);

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const cardBg = isDark ? '#222' : '#f9fafb';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid #2D7889',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River not found
      </div>
    );
  }

  // Group services by type
  const grouped: Record<string, ServiceItem[]> = {};
  for (const service of services) {
    if (!grouped[service.type]) grouped[service.type] = [];
    grouped[service.type].push(service);
  }

  const typeOrder = ['outfitter', 'campground', 'cabin_lodge'];
  const sortedTypes = typeOrder.filter(t => grouped[t]?.length);

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={36}
          height={36}
          style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
            {typeFilter ? TYPE_CONFIG[typeFilter]?.label + 's' : 'Services'} on the {river.name}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            {services.length} {services.length === 1 ? 'listing' : 'listings'}
          </div>
        </div>
      </div>

      {/* Services list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
        {services.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: textSecondary, fontSize: 13 }}>
            No services found for this river.
          </div>
        )}

        {sortedTypes.map(type => (
          <div key={type}>
            {/* Type header (only if showing multiple types) */}
            {!typeFilter && sortedTypes.length > 1 && (
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: TYPE_CONFIG[type]?.color || textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 4,
                marginTop: type === sortedTypes[0] ? 0 : 6,
              }}>
                {TYPE_CONFIG[type]?.icon} {TYPE_CONFIG[type]?.label}s
              </div>
            )}

            {grouped[type]?.map(service => {
              const isHighlighted = highlightSlugs.includes(service.slug);
              const highlightBorder = isHighlighted ? '#2D7889' : borderColor;
              const highlightBg = isHighlighted
                ? (isDark ? '#1a2f35' : '#f0f9fb')
                : cardBg;

              return (
                <div
                  key={service.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: highlightBg,
                    border: `1.5px solid ${highlightBorder}`,
                    boxShadow: isHighlighted
                      ? '0 1px 4px rgba(45,120,137,0.15)'
                      : `0 1px 2px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {/* Name + type badge row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {service.name}
                    </span>
                    {/* Type badge (when showing all types) */}
                    {!typeFilter && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: TYPE_CONFIG[service.type]?.color || textSecondary,
                        padding: '1px 5px',
                        borderRadius: 3,
                        backgroundColor: `${TYPE_CONFIG[service.type]?.color || '#999'}15`,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        {TYPE_CONFIG[service.type]?.label}
                      </span>
                    )}
                    {service.npsAuthorized && (
                      <span style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: '#059669',
                        padding: '1px 4px',
                        borderRadius: 3,
                        backgroundColor: '#05966915',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        NPS
                      </span>
                    )}
                  </div>

                  {/* Service tags */}
                  {service.servicesOffered.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {service.servicesOffered.slice(0, 5).map(s => (
                        <span
                          key={s}
                          style={{
                            fontSize: 9,
                            fontWeight: 500,
                            color: isDark ? '#aaa' : '#666',
                            padding: '1px 5px',
                            borderRadius: 3,
                            backgroundColor: isDark ? '#333' : '#f0f0f0',
                          }}
                        >
                          {SERVICE_LABELS[s] || s}
                        </span>
                      ))}
                      {service.servicesOffered.length > 5 && (
                        <span style={{ fontSize: 9, color: textSecondary }}>
                          +{service.servicesOffered.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Contact row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 11 }}>
                    {(() => {
                      const links: React.ReactNode[] = [];
                      if (service.phone) {
                        links.push(
                          <a key="phone" href={`tel:${service.phone}`} style={{ color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}>
                            {service.phone}
                          </a>
                        );
                      }
                      if (service.isNpsCampground && service.reservationUrl) {
                        links.push(
                          <a key="reserve" href={service.reservationUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', textDecoration: 'none', fontWeight: 600 }}>
                            Reserve
                          </a>
                        );
                      }
                      if (service.website && !service.isNpsCampground) {
                        links.push(
                          <a key="website" href={service.website.startsWith('http') ? service.website : `https://${service.website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2D7889', textDecoration: 'none', fontWeight: 500 }}>
                            Website
                          </a>
                        );
                      }
                      if (service.latitude && service.longitude) {
                        links.push(
                          <a key="map" href={`https://www.google.com/maps/search/?api=1&query=${service.latitude},${service.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2D7889', textDecoration: 'none', fontWeight: 500 }}>
                            Map
                          </a>
                        );
                      }
                      if (links.length === 0 && service.city) {
                        return <span style={{ color: textSecondary }}>{service.city}, {service.state}</span>;
                      }
                      return links.map((link, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {link}
                          {i < links.length - 1 && <span style={{ margin: '0 6px', color: isDark ? '#555' : '#ccc' }}>&middot;</span>}
                        </span>
                      ));
                    })()}
                  </div>

                  {/* Seasonal note */}
                  {service.seasonalNotes && (
                    <div style={{ fontSize: 10, color: textSecondary, fontStyle: 'italic' }}>
                      {service.seasonalNotes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: partner ? 'space-between' : 'space-between',
        borderTop: `1px solid ${borderColor}`,
        paddingTop: 8,
        marginTop: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href={`${origin}/rivers/${river.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            Full river guide &rarr;
          </a>
          {partner && (
            <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500 }}>
              via {partner}
            </span>
          )}
        </div>
        <a
          href={origin}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: textSecondary,
            textDecoration: 'none',
          }}
        >
          <Image
            src={EDDY_LOGO}
            alt="Eddy"
            width={16}
            height={16}
            style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
          />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
