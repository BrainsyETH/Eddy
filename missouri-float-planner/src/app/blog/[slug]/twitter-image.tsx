// src/app/blog/[slug]/twitter-image.tsx
// Twitter card image for blog posts (same as OG)

export { default, generateImageMetadata, size, contentType } from './opengraph-image';
export const revalidate = 300;
