// src/lib/email/render.ts
// Renders admin reply emails into Eddy-branded HTML + a plain-text fallback.
// Brand tokens mirror SiteHeader: warm sandbar chrome, the existing otter,
// a coral wordmark and teal links. Email clients use system-font fallbacks.

const BRAND = {
  bg: '#F7F6F3',
  card: '#ffffff',
  cardBorder: '#DBD5CA',
  header: '#FAF8F4',
  headerBorder: '#E8DFD0',
  wordmark: '#E5573F',
  heading: '#163F4A',
  ink: '#2D2A24',
  muted: '#6B6459',
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
            <td class="eddy-gutter" style="padding:24px; font-family:${BRAND.bodyFont}; color:${BRAND.muted}; overflow-wrap:break-word; word-wrap:break-word; word-break:break-word;">
              <p style="margin:0 0 12px 0; font-size:12px; line-height:18px;">On ${escapeHtml(
                formatWhen(original.date),
              )}, ${escapeHtml(original.from || 'someone')} wrote:</p>
              <div style="border-left:2px solid ${BRAND.divider}; padding-left:12px; font-size:14px; line-height:22px; white-space:pre-wrap;">${escapeHtml(
                original.text.trim(),
              )}</div>
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
  table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  .eddy-body { font-family:${BRAND.bodyFont}; font-size:16px; line-height:25px; color:${BRAND.ink}; }
  .eddy-body p { margin:0 0 14px 0; }
  .eddy-body > :last-child { margin-bottom:0; }
  .eddy-body a { color:${BRAND.link}; font-weight:600; }
  .eddy-body h1,.eddy-body h2,.eddy-body h3,.eddy-body h4 { font-family:${BRAND.headingFont}; color:${BRAND.heading}; margin:0 0 12px 0; line-height:1.25; }
  .eddy-body h1 { font-size:26px; } .eddy-body h2 { font-size:22px; } .eddy-body h3 { font-size:18px; }
  .eddy-body ul,.eddy-body ol { margin:0 0 14px 0; padding-left:22px; }
  .eddy-body li { margin:0 0 6px 0; }
  .eddy-body blockquote { margin:0 0 14px 0; padding:8px 14px; border-left:3px solid #7FC4D4; background:#F4F2ED; color:#4A463F; }
  .eddy-body img { max-width:100%; height:auto; border-radius:10px; }
  .eddy-body hr { border:none; border-top:1px solid ${BRAND.divider}; margin:18px 0; }
  @media only screen and (max-width:480px) {
    .eddy-outer { padding:12px 8px !important; }
    .eddy-gutter { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td class="eddy-outer" align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; table-layout:fixed;">
          <tr>
            <td style="background-color:${BRAND.card}; border:1px solid ${BRAND.cardBorder}; border-radius:12px; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; table-layout:fixed;">
                <tr>
                  <td class="eddy-gutter" style="background-color:${BRAND.header}; padding:16px 24px; border-bottom:1px solid ${BRAND.headerBorder}; border-radius:11px 11px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" style="vertical-align:middle;"><img src="${BRAND.logo}" width="32" height="32" alt="" style="border:0; border-radius:6px; display:block;"></td>
                        <td style="padding-left:10px; font-family:${BRAND.headingFont}; font-size:24px; line-height:32px; font-weight:700; color:${BRAND.wordmark}; vertical-align:middle;">Eddy</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="eddy-body eddy-gutter" style="padding:24px; font-family:${BRAND.bodyFont}; font-size:16px; line-height:25px; color:${BRAND.ink}; overflow-wrap:break-word; word-wrap:break-word; word-break:break-word;">
                    ${safeContentHtml}
                  </td>
                </tr>
                <tr>
                  <td class="eddy-gutter" style="padding:0 24px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-top:12px; border-top:1px solid ${BRAND.divider}; font-family:${BRAND.bodyFont};">
                          <a href="https://eddy.guide" style="display:inline-block; padding:10px 0; font-size:14px; line-height:24px; color:${BRAND.link}; font-weight:600; text-decoration:underline;">eddy.guide</a>
                          <p style="margin:0; font-size:12px; line-height:18px; color:${BRAND.muted};">Rivers, lakes &amp; trip planning</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>${quoted}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback: the reply, website footer, then the quoted original. */
export function buildReplyText(bodyText: string, original?: OriginalMessage): string {
  const parts = [bodyText.trimEnd(), '', 'eddy.guide'];
  if (original?.text && original.text.trim()) {
    const quoted = original.text.trim().split('\n').map((line) => `> ${line}`).join('\n');
    parts.push('', `On ${formatWhen(original.date)}, ${original.from || 'someone'} wrote:`, quoted);
  }
  return parts.join('\n');
}
