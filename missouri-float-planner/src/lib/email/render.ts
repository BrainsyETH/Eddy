// src/lib/email/render.ts
// Renders admin reply emails into Eddy-branded HTML + a plain-text fallback.
// Brand tokens mirror the marketing emails in /marketing (deep-teal header,
// Fredoka headings, river-blue links, warm cream background).

const BRAND = {
  bg: '#EDEBE6',
  card: '#ffffff',
  cardBorder: '#2D2A24',
  header: '#163F4A',
  ink: '#2D2A24',
  muted: '#6B665C',
  divider: '#DBD5CA',
  link: '#2D7889',
  logo: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png',
  bodyFont: "'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  headingFont: "'Fredoka','Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

export interface OriginalMessage {
  from: string | null;
  date: string | null; // ISO timestamp
  text: string | null;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse HTML to readable plain text, preserving block breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(ul|ol|table)>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'a previous message';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'a previous message';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Wraps already-sanitized reply content HTML in the Eddy email shell.
 * Callers must sanitize `safeContentHtml` (e.g. via sanitizeRichText) first.
 */
export function renderReplyEmail(safeContentHtml: string, original?: OriginalMessage): string {
  const quoted =
    original?.text && original.text.trim()
      ? `
              <tr>
                <td style="padding:2px 26px 0 26px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td style="border-top:1px solid ${BRAND.divider}; padding-top:16px;">
                      <p style="margin:0 0 8px 0; font-family:${BRAND.bodyFont}; font-size:12px; color:${BRAND.muted};">On ${escapeHtml(
                        formatWhen(original.date),
                      )}, ${escapeHtml(original.from || 'someone')} wrote:</p>
                      <div style="border-left:3px solid ${BRAND.divider}; padding-left:12px; font-family:${BRAND.bodyFont}; font-size:14px; line-height:21px; color:${BRAND.muted}; white-space:pre-wrap;">${escapeHtml(
                        original.text.trim(),
                      )}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  .eddy-body { font-family:${BRAND.bodyFont}; font-size:16px; line-height:25px; color:${BRAND.ink}; }
  .eddy-body p { margin:0 0 14px 0; }
  .eddy-body a { color:${BRAND.link}; font-weight:600; }
  .eddy-body h1,.eddy-body h2,.eddy-body h3,.eddy-body h4 { font-family:${BRAND.headingFont}; color:${BRAND.header}; margin:0 0 12px 0; line-height:1.25; }
  .eddy-body h1 { font-size:26px; } .eddy-body h2 { font-size:22px; } .eddy-body h3 { font-size:18px; }
  .eddy-body ul,.eddy-body ol { margin:0 0 14px 0; padding-left:22px; }
  .eddy-body li { margin:0 0 6px 0; }
  .eddy-body blockquote { margin:0 0 14px 0; padding:8px 14px; border-left:3px solid #7FC4D4; background:#F4F2ED; color:#4A463F; }
  .eddy-body img { max-width:100%; height:auto; border-radius:10px; }
  .eddy-body hr { border:none; border-top:1px solid ${BRAND.divider}; margin:18px 0; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:${BRAND.card}; border-radius:16px; overflow:hidden; border:2px solid ${BRAND.cardBorder};">
          <tr>
            <td style="background-color:${BRAND.header}; padding:16px 26px;">
              <img src="${BRAND.logo}" width="30" height="30" alt="Eddy" style="vertical-align:middle; border-radius:8px; display:inline-block;">
              <span style="font-family:${BRAND.headingFont}; font-size:20px; font-weight:700; color:#ffffff; vertical-align:middle; padding-left:10px;">Eddy</span>
            </td>
          </tr>
          <tr>
            <td class="eddy-body" style="padding:26px 26px 6px 26px;">
              ${safeContentHtml}
            </td>
          </tr>${quoted}
          <tr>
            <td style="padding:18px 26px 22px 26px; border-top:1px solid ${BRAND.divider};">
              <p style="margin:0; font-family:${BRAND.bodyFont}; font-size:12px; line-height:18px; color:${BRAND.muted};">
                Eddy · Missouri float trip planner · <a href="https://eddy.guide" style="color:${BRAND.link}; font-weight:600;">eddy.guide</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback: the reply text, then the quoted original. */
export function buildReplyText(bodyText: string, original?: OriginalMessage): string {
  const parts = [bodyText.trimEnd()];
  if (original?.text && original.text.trim()) {
    const quoted = original.text.trim().split('\n').map((line) => `> ${line}`).join('\n');
    parts.push('', `On ${formatWhen(original.date)}, ${original.from || 'someone'} wrote:`, quoted);
  }
  return parts.join('\n');
}
