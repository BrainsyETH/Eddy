export const ADMIN_SESSION_COOKIE = 'mfp_admin_session';

interface AdminCredentialRequest {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}

/**
 * Cheap presence check for the central proxy. Cryptographic validation still
 * happens inside every privileged route through requireAdminAuth().
 */
export function hasAdminCredential(request: AdminCredentialRequest): boolean {
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const cookieToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value.trim() ?? '';

  return Boolean(bearerToken || cookieToken);
}
