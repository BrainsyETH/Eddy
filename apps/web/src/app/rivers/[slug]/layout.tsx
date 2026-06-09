// src/app/rivers/[slug]/layout.tsx
// Layout for river detail pages
// Metadata is now exported from page.tsx (which has access to searchParams for float plan OG)

// Force dynamic rendering - this page fetches live data from Supabase
export const dynamic = 'force-dynamic';

interface RiverLayoutProps {
  children: React.ReactNode;
}

export default function RiverLayout({ children }: RiverLayoutProps) {
  return children;
}
