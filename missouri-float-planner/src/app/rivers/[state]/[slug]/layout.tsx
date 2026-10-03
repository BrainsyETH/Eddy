// src/app/rivers/[slug]/layout.tsx
// Layout for river detail pages
// Metadata is now exported from page.tsx (which has access to searchParams for float plan OG)

// Each public page owns its explicit revalidation policy.

interface RiverLayoutProps {
  children: React.ReactNode;
}

export default function RiverLayout({ children }: RiverLayoutProps) {
  return children;
}
