// src/lib/security/public-url.ts
// Fetching a URL that someone typed, without letting it reach inside.
//
// Admin screens accept URLs the server then fetches (a Maps short link to
// expand, an agency page to read a photo from). A plain fetch() follows
// redirects anywhere, including loopback, link-local metadata endpoints and
// private ranges. fetchPublicUrl() follows redirects itself and checks every
// hop: https only (unless told otherwise), and a hostname that resolves only
// to public addresses.
//
// Limit worth knowing: the address is checked, then fetch() resolves the name
// again. A hostile DNS server can answer differently the second time. Closing
// that needs a pinned-address connection; this closes the direct and
// redirect-based routes, which are the practical ones.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 3], // multicast and reserved
];

/** True for an address that is not on the public internet. Unparseable input is not public. */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToInt(address);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return ((value & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
    });
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isNonPublicAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('::ffff:') || // hex-form IPv4-mapped: refuse rather than decode
      /^f[cd]/.test(lower) || // fc00::/7 unique local
      /^fe[89ab]/.test(lower) || // fe80::/10 link-local
      lower.startsWith('ff') // multicast
    );
  }
  return true;
}

export class BlockedUrlError extends Error {}

type Resolver = (hostname: string) => Promise<string[]>;

const dnsResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** Throws BlockedUrlError unless the URL is http(s) to a host with only public addresses. */
export async function assertPublicUrl(
  input: string | URL,
  options: { allowHttp?: boolean; resolve?: Resolver } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    throw new BlockedUrlError('Not a valid URL');
  }
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) {
    throw new BlockedUrlError('Only https URLs are fetched');
  }
  if (url.username || url.password) throw new BlockedUrlError('URLs with credentials are not fetched');

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [hostname] : await (options.resolve ?? dnsResolver)(hostname).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError('Host did not resolve');
  if (addresses.some(isNonPublicAddress)) throw new BlockedUrlError('Host is not a public address');
  return url;
}

export interface PublicFetchOptions {
  init?: Omit<RequestInit, 'redirect'>;
  maxRedirects?: number;
  allowHttp?: boolean;
  resolve?: Resolver;
  fetchImpl?: typeof fetch;
}

/**
 * fetch() that checks the starting URL and every redirect target with
 * assertPublicUrl. Returns the final response and the URL it came from.
 */
export async function fetchPublicUrl(
  input: string,
  options: PublicFetchOptions = {},
): Promise<{ response: Response; finalUrl: string }> {
  const { init, maxRedirects = 5, fetchImpl = fetch } = options;
  let current = await assertPublicUrl(input, options);
  for (let hop = 0; ; hop++) {
    const response = await fetchImpl(current, { ...init, redirect: 'manual' });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) return { response, finalUrl: current.toString() };
    if (hop >= maxRedirects) throw new BlockedUrlError('Too many redirects');
    await response.body?.cancel().catch(() => undefined);
    current = await assertPublicUrl(new URL(location, current), options);
  }
}
