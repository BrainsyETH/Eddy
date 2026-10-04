/** Native identity linking preserves a first-time guest's server-owned data. */
interface AuthResult<T> {
  data: { session: T | null };
  error: { code?: string; message: string } | null;
}

export async function resolveAppleIdentity<T>({
  anonymous,
  link,
  signIn,
}: {
  anonymous: boolean;
  link: () => Promise<AuthResult<T>>;
  signIn: () => Promise<AuthResult<T>>;
}): Promise<T> {
  let result = anonymous ? await link() : await signIn();
  // An existing Apple account must win over this installation's guest account.
  // Other errors (including disabled linking) must not silently abandon it.
  if (anonymous && result.error?.code === 'identity_already_exists') result = await signIn();
  if (result.error) {
    if (result.error.code === 'manual_linking_disabled') {
      throw new Error('Account setup is temporarily unavailable. Please try again later.');
    }
    throw new Error(result.error.message);
  }
  if (!result.data.session) throw new Error('Apple sign-in did not create a session. Please try again.');
  return result.data.session;
}
