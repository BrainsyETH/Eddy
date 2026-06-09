// src/lib/sanitize.ts
// HTML sanitization for user/admin-submitted rich text content.
// Used by blog posts and access point localTips.

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes HTML content from TipTap editor.
 * Allows safe formatting tags but strips scripts, iframes, event handlers, etc.
 */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;

  return sanitizeHtml(html, {
    allowedTags: [
      // Text formatting
      'p', 'br', 'strong', 'em', 'u', 's', 'sub', 'sup',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Lists
      'ul', 'ol', 'li',
      // Links
      'a',
      // Blocks
      'blockquote', 'pre', 'code', 'hr',
      // Images (for embedded images in blog posts)
      'img',
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      // Other
      'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      span: ['class'],
      div: ['class'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Force rel="noopener noreferrer" on links
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
        },
      }),
    },
  });
}
