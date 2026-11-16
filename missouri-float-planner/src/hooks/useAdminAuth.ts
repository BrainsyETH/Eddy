'use client';
import { useAdminSession } from '@/components/admin/AdminSessionProvider';
export { adminFetch } from '@/lib/admin/session-client';
export const useAdminAuth = useAdminSession;
