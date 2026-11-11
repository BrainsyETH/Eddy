'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Compass,
  FileText,
  Film,
  History,
  Home,
  Image,
  Inbox,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Navigation,
  RefreshCw,
  Share2,
  ShieldCheck,
  Star,
  Users,
  Waves,
  X,
} from 'lucide-react';
import { adminFetch, useAdminAuth } from '@/hooks/useAdminAuth';
import { ADMIN_CHANGED_EVENT } from './AdminSessionProvider';
import {
  ADMIN_NAV_GROUPS,
  adminNavActive,
  canVisitAdminPage,
} from '@/lib/admin/navigation';
import { useAdminInteractions } from './AdminInteractionProvider';

const icons = {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Compass,
  FileText,
  Film,
  History,
  Home,
  Image,
  Inbox,
  MapPin,
  MessageSquare,
  Navigation,
  RefreshCw,
  Share2,
  ShieldCheck,
  Users,
  Waves,
};
export default function AdminLayout({
  children,
  title,
  description,
  hideHeader,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  hideHeader?: boolean;
}) {
  const { identity, logout, error } = useAdminAuth();
  const { confirm } = useAdminInteractions();
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [auditWarning, setAuditWarning] = useState(false);
  useEffect(() => {
    const warn = () => setAuditWarning(true);
    window.addEventListener('admin-audit-warning', warn);
    return () => window.removeEventListener('admin-audit-warning', warn);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const pinKey = `eddy-admin-pins:${identity?.id ?? 'recovery'}`;
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(pinKey) ?? '[]');
      setPins(
        Array.isArray(saved)
          ? saved
              .filter((item): item is string => typeof item === 'string')
              .slice(0, 4)
          : [],
      );
    } catch {
      setPins([]);
    }
  }, [pinKey]);
  const [badges, setBadges] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void adminFetch('/api/admin/stats')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!disposed) setBadges(data?.stats ?? null);
          })
          .catch(() => {
            if (!disposed) setBadges(null);
          });
      }, 200);
    };
    refresh();
    window.addEventListener(ADMIN_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener(ADMIN_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (menuOpen) drawer.current?.showModal();
    else {
      drawer.current?.close();
    }
  }, [menuOpen]);
  const closeMenu = () => {
    setMenuOpen(false);
    trigger.current?.focus();
  };
  const signOut = async () => {
    if (
      await confirm('Sign out of Eddy admin? Save any open changes first.', {
        confirmLabel: 'Sign out',
      })
    )
      await logout();
  };
  const role = identity?.role ?? 'owner';
  const items = ADMIN_NAV_GROUPS.flatMap((group) => [...group.items]);
  const currentItem = items.find(
    (item) => item.href !== '/admin' && adminNavActive(pathname, item.href),
  );
  const pinnedItems = items.filter(
    (item) => pins.includes(item.href) && canVisitAdminPage(role, item.href),
  );
  const togglePin = () => {
    if (!currentItem) return;
    const next = pins.includes(currentItem.href)
      ? pins.filter((href) => href !== currentItem.href)
      : [...pins, currentItem.href].slice(0, 4);
    setPins(next);
    try {
      localStorage.setItem(pinKey, JSON.stringify(next));
    } catch {
      /* Session-only shortcuts still work. */
    }
  };
  const navigation = (
    <nav aria-label="Admin">
      {pinnedItems.length > 0 && (
        <div className="admin-nav-group">
          <p>Shortcuts</p>
          {pinnedItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu}>
              <Star size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) =>
          canVisitAdminPage(role, item.href),
        );
        if (!items.length) return null;
        return (
          <div className="admin-nav-group" key={group.label}>
            <p>{group.label}</p>
            {items.map((item) => {
              const Icon = icons[item.icon];
              const count = 'badge' in item ? badges?.[item.badge] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    adminNavActive(pathname, item.href) ? 'page' : undefined
                  }
                  onClick={closeMenu}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  {typeof count === 'number' && count > 0 && (
                    <span className="admin-badge">{count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
  const identityRow = (
    <div className="admin-identity">
      <span>
        <strong>{identity?.name ?? 'Owner'}</strong>
        <small>{identity?.legacy ? 'Owner recovery access' : role}</small>
      </span>
      <button onClick={signOut} aria-label="Sign out">
        <LogOut size={19} />
      </button>
    </div>
  );
  return (
    <div className="admin-workspace">
      <a className="admin-skip" href="#admin-content">
        Skip to workspace
      </a>
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand">
          Eddy <span>Admin</span>
        </Link>
        {navigation}
        {identityRow}
      </aside>
      <div className="admin-mobile-bar">
        <Link href="/admin" className="admin-brand">
          Eddy <span>Admin</span>
        </Link>
        <button
          ref={trigger}
          aria-label="Open admin navigation"
          aria-expanded={menuOpen}
          aria-controls="admin-mobile-nav"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </button>
      </div>
      <dialog
        ref={drawer}
        id="admin-mobile-nav"
        className="admin-drawer"
        aria-label="Admin navigation"
        onCancel={closeMenu}
      >
        <div className="admin-drawer-heading">
          <span className="admin-brand">
            Eddy <span>Admin</span>
          </span>
          <button onClick={closeMenu} aria-label="Close navigation">
            <X />
          </button>
        </div>
        {navigation}
        {identityRow}
      </dialog>
      <section className="admin-body" id="admin-content" tabIndex={-1}>
        {!hideHeader && pathname !== '/admin' && (
          <header className="admin-page-heading">
            <p className="admin-eyebrow">Eddy workspace</p>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
            {currentItem && (
              <button
                className="admin-link"
                aria-pressed={pins.includes(currentItem.href)}
                disabled={pins.length >= 4 && !pins.includes(currentItem.href)}
                onClick={togglePin}
              >
                {pins.includes(currentItem.href)
                  ? 'Remove shortcut'
                  : pins.length >= 4
                    ? 'Four shortcuts pinned'
                    : 'Pin to shortcuts'}
              </button>
            )}
          </header>
        )}
        {auditWarning && (
          <p className="admin-error" role="alert">
            The action finished, but its activity record is incomplete. Review
            Activity history before relying on the audit trail.{' '}
            <button onClick={() => setAuditWarning(false)}>Dismiss</button>
          </p>
        )}
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {canVisitAdminPage(role, pathname) ? (
          children
        ) : (
          <div className="admin-panel">
            <h2>This page isn’t available to your role</h2>
            <p>
              Your {role} account can use the sections listed in navigation.
            </p>
            <Link href="/admin">Return to overview</Link>
          </div>
        )}
      </section>
    </div>
  );
}
