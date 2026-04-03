import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

interface Props {
  params: Promise<{ slug: string; accessSlug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug: riverSlug, accessSlug } = await params;
    const supabase = await createClient();

    const { data: river } = await supabase
      .from('rivers')
      .select('id, name')
      .eq('slug', riverSlug)
      .single();

    if (!river) return { title: 'Access Point Not Found' };

    const { data: ap } = await supabase
      .from('access_points')
      .select('name, description, type, is_public, amenities, image_urls')
      .eq('river_id', river.id)
      .eq('slug', accessSlug)
      .eq('approved', true)
      .single();

    if (!ap) return { title: 'Access Point Not Found' };

    const title = `${ap.name} - ${river.name}`;
    const description = ap.description
      || `${ap.name} is a ${ap.is_public ? 'public' : 'private'} ${ap.type?.replace('_', ' ') || 'access point'} on the ${river.name}. Plan your float trip on Eddy.`;

    const pageUrl = `${BASE_URL}/rivers/${riverSlug}/access/${accessSlug}`;

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
        types: {
          'application/json': `${BASE_URL}/api/rivers/${riverSlug}/access/${accessSlug}`,
        },
      },
      openGraph: {
        type: 'website',
        title: `${ap.name} | ${river.name} Access Point`,
        description,
        url: pageUrl,
        siteName: 'Eddy',
        ...(ap.image_urls?.length > 0 && {
          images: [{ url: ap.image_urls[0] }],
        }),
      },
      twitter: {
        card: 'summary_large_image',
        title: `${ap.name} | ${river.name}`,
        description,
        ...(ap.image_urls?.length > 0 && {
          images: [ap.image_urls[0]],
        }),
      },
    };
  } catch {
    return {
      title: 'Access Point',
      description: 'River access point details on Eddy.',
    };
  }
}

export default async function AccessPointLayout({ params, children }: Props) {
  const { slug: riverSlug, accessSlug } = await params;

  // Fetch minimal data for Place JSON-LD
  let placeJsonLd: Record<string, unknown> | null = null;

  try {
    const supabase = await createClient();

    const { data: river } = await supabase
      .from('rivers')
      .select('id, name')
      .eq('slug', riverSlug)
      .single();

    if (river) {
      const { data: ap } = await supabase
        .from('access_points')
        .select('name, description, type, is_public, amenities, location_snap, location_orig')
        .eq('river_id', river.id)
        .eq('slug', accessSlug)
        .eq('approved', true)
        .single();

      if (ap) {
        const lng = ap.location_snap?.coordinates?.[0] || ap.location_orig?.coordinates?.[0];
        const lat = ap.location_snap?.coordinates?.[1] || ap.location_orig?.coordinates?.[1];

        placeJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: ap.name,
          description: ap.description || `${ap.type?.replace('_', ' ') || 'Access point'} on the ${river.name}.`,
          ...(lat && lng && {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: lat,
              longitude: lng,
            },
          }),
          publicAccess: ap.is_public,
          isAccessibleForFree: true,
          amenityFeature: (ap.amenities || []).map((a: string) => ({
            '@type': 'LocationFeatureSpecification',
            name: a,
            value: true,
          })),
          containedInPlace: {
            '@type': 'TouristAttraction',
            name: river.name,
            url: `${BASE_URL}/rivers/${riverSlug}`,
          },
        };
      }
    }
  } catch {
    // Structured data is best-effort
  }

  return (
    <>
      {placeJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd) }}
        />
      )}
      {children}
    </>
  );
}
