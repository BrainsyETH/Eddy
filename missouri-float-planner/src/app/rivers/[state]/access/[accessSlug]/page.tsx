// src/app/rivers/[state]/access/[accessSlug]/page.tsx
// Legacy access-point URL shim. Before the /rivers/[state]/[slug] hierarchy,
// access pages lived at /rivers/[riverSlug]/access/[accessSlug] — which now
// parses as state=[riverSlug]. Look the river up and 301 to the canonical
// /rivers/[state]/[riverSlug]/access/[accessSlug].

import { notFound, permanentRedirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { riverAccessPath } from '@/lib/navigation/river-path';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ state: string; accessSlug: string }>;
}

export default async function LegacyAccessRedirect({ params }: Props) {
  const { state: legacyRiverSlug, accessSlug } = await params;

  const supabase = await createClient();
  const { data: river } = await supabase
    .from('rivers')
    .select('slug, state')
    .eq('slug', legacyRiverSlug)
    .eq('active', true)
    .maybeSingle();

  if (!river) {
    notFound();
  }

  permanentRedirect(riverAccessPath(river.state, river.slug, accessSlug));
}
