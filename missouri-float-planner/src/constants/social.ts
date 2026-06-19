// src/constants/social.ts
// Single source of truth for Eddy's official social profiles. Used by the
// footer (rendered links) and the WebSite structured data (sameAs) so the two
// never drift. Add a platform here and it shows up in both places.

export interface SocialLink {
  label: string;
  href: string;
  icon: 'instagram' | 'facebook';
}

export const SOCIAL_LINKS: SocialLink[] = [
  { label: 'Instagram', href: 'https://instagram.com/eddy_guide', icon: 'instagram' },
  { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61586433100801', icon: 'facebook' },
];

// URLs for schema.org sameAs (knowledge-graph association).
export const SOCIAL_SAME_AS: string[] = SOCIAL_LINKS.map((s) => s.href);
