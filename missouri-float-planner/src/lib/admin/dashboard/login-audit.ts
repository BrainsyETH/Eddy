import { createAdminClient } from '@/lib/supabase/admin';
export async function recordLogin(success: boolean) {
  try {
    const { error } = await createAdminClient()
      .rpc('record_admin_login', { p_success: success })
      .abortSignal(AbortSignal.timeout(800));
    if (error) console.warn('[login-audit] Recording unavailable');
  } catch {
    console.warn('[login-audit] Recording unavailable');
  }
}
