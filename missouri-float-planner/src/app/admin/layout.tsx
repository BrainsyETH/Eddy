import type { Metadata } from 'next';
import AdminSessionProvider from '@/components/admin/AdminSessionProvider';
import AdminInteractionProvider from '@/components/admin/AdminInteractionProvider';
import './admin.css';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminSessionProvider><AdminInteractionProvider>{children}</AdminInteractionProvider></AdminSessionProvider>;
}
