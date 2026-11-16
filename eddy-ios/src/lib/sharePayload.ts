// What a link share hands the system share sheet. Pure (no react-native
// import) so the web test suite can run it; share.ts supplies Platform.OS.

type ShareContent =
  | { url: string; message?: string; title?: string }
  | { message: string; url?: string; title?: string };

export interface NativeShare {
  content: ShareContent;
  options: { subject?: string };
}

/**
 * A link on its own: a river, gauge, dam, access point or chart.
 *
 * On iOS, React Native gives the share sheet `message` and `url` as two
 * separate items (RCTActionSheetManager). The link used to ride in both, so
 * Messages, Mail and Notes received it twice and Copy copied it twice. It now
 * goes once, as the URL item alone: there is no second item for a target to
 * drop, the sheet shows the page's preview, and Copy yields just the link. The
 * title becomes the subject, which Mail uses.
 *
 * Android's share intent reads only `message`, so the link stays in the text
 * there.
 */
export function linkSharePayload(os: string, title: string, url: string): NativeShare {
  if (os === 'ios') return { content: { url }, options: { subject: title } };
  return { content: { title, message: `${title}\n${url}` }, options: {} };
}
