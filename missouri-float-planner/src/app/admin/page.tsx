'use client';

// src/app/admin/page.tsx
// Admin dashboard with quick stats and navigation

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  MapPin,
  Image as ImageIcon,
  ExternalLink,
  Navigation,
  Flag,
  FileText,
  Activity,
  RefreshCw,
  Share2,
  AlertTriangle,
  Clock,
  Layers,
  ShieldAlert,
  MessageSquare,
  History,
  Compass,
} from 'lucide-react';

interface DashboardStats {
  totalFeedback: number;
  pendingFeedback: number;
  totalAccessPoints: number;
  unapprovedAccessPoints: number;
  totalRivers: number;
  totalBlogPosts: number;
  publishedBlogPosts: number;
  totalGaugeStations: number;
  totalPOIs: number;
  lastGaugeUpdate: string | null;
}

const ADMIN_SECTIONS = [
  {
    title: 'Feedback',
    description: 'Review user-submitted feedback and data reports',
    href: '/admin/feedback',
    icon: Flag,
    color: 'bg-accent-500',
    statKey: 'pendingFeedback' as const,
    statLabel: 'pending',
  },
  {
    title: 'Access Points',
    description: 'Manage access point images and details',
    href: '/admin/access-points',
    icon: Navigation,
    color: 'bg-teal-500',
    statKey: 'unapprovedAccessPoints' as const,
    statLabel: 'unapproved',
  },
  {
    title: 'Geography Editor',
    description: 'Edit access point locations and river line geometries',
    href: '/admin/geography',
    icon: MapPin,
    color: 'bg-blue-500',
  },
  {
    title: 'Blog Posts',
    description: 'Create and manage blog posts and river guides',
    href: '/admin/blog',
    icon: FileText,
    color: 'bg-orange-500',
  },
  {
    title: 'Gauge Thresholds',
    description: 'Configure water level thresholds and floating descriptions',
    href: '/admin/gauges',
    icon: Activity,
    color: 'bg-green-500',
  },
  {
    title: 'Data Sync',
    description: 'Sync USFS campgrounds as pending POIs from Recreation.gov (RIDB)',
    href: '/admin/data-sync',
    icon: RefreshCw,
    color: 'bg-emerald-500',
  },
  {
    title: 'Image Library',
    description: 'Upload and manage images for rivers, access points, and more',
    href: '/admin/images',
    icon: ImageIcon,
    color: 'bg-purple-500',
  },
  {
    title: 'Points of Interest',
    description: 'Manage springs, caves, campgrounds, and other points of interest',
    href: '/admin/pois',
    icon: Compass,
    color: 'bg-cyan-500',
  },
  {
    title: 'Hazards',
    description: 'Manage river hazards, portages, and safety warnings',
    href: '/admin/hazards',
    icon: ShieldAlert,
    color: 'bg-red-500',
  },
  {
    title: 'Community Reports',
    description: 'Review and moderate user-submitted hazard and condition reports',
    href: '/admin/reports',
    icon: MessageSquare,
    color: 'bg-indigo-500',
  },
  {
    title: 'Social Media',
    description: 'Manage Instagram and Facebook auto-posting settings and history',
    href: '/admin/social',
    icon: Share2,
    color: 'bg-pink-500',
  },
  {
    title: 'Activity Log',
    description: 'View admin action history and audit trail',
    href: '/admin/activity',
    icon: History,
    color: 'bg-neutral-500',
  },
];

const QUICK_LINKS = [
  { label: 'View Site', href: '/', external: false },
  { label: 'Rivers', href: '/rivers', external: false },
  { label: 'River Levels', href: '/gauges', external: false },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await adminFetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch {
        // Stats are non-critical, fail silently
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <AdminLayout
      title="Dashboard"
      description="Manage your Eddy Float Planner data"
    >
      <div className="p-6 max-w-4xl mx-auto">
        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Rivers"
              value={stats.totalRivers}
              icon={<Layers className="w-4 h-4" />}
            />
            <StatCard
              label="Access Points"
              value={stats.totalAccessPoints}
              icon={<Navigation className="w-4 h-4" />}
              alert={stats.unapprovedAccessPoints > 0 ? `${stats.unapprovedAccessPoints} unapproved` : undefined}
            />
            <StatCard
              label="Gauge Stations"
              value={stats.totalGaugeStations}
              icon={<Activity className="w-4 h-4" />}
              subtitle={stats.lastGaugeUpdate ? `Updated ${formatTimeAgo(stats.lastGaugeUpdate)}` : undefined}
            />
            <StatCard
              label="Blog Posts"
              value={stats.publishedBlogPosts}
              icon={<FileText className="w-4 h-4" />}
              subtitle={stats.totalBlogPosts > stats.publishedBlogPosts ? `${stats.totalBlogPosts - stats.publishedBlogPosts} draft` : undefined}
            />
            <StatCard
              label="Feedback"
              value={stats.totalFeedback}
              icon={<Flag className="w-4 h-4" />}
              alert={stats.pendingFeedback > 0 ? `${stats.pendingFeedback} pending` : undefined}
            />
            <StatCard
              label="POIs"
              value={stats.totalPOIs}
              icon={<MapPin className="w-4 h-4" />}
            />
          </div>
        )}
        {statsLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-neutral-700 rounded w-16 mb-2" />
                <div className="h-6 bg-neutral-700 rounded w-10" />
              </div>
            ))}
          </div>
        )}

        {/* Admin Sections */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {ADMIN_SECTIONS.map((section) => {
            const Icon = section.icon;
            const badgeCount = section.statKey && stats ? stats[section.statKey] : 0;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 hover:border-neutral-600 transition-colors group relative"
              >
                <div className="flex items-start gap-4">
                  <div className={`${section.color} p-3 rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
                      {section.title}
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">
                      {section.description}
                    </p>
                  </div>
                </div>
                {badgeCount > 0 && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    {badgeCount} {section.statLabel}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Quick Links */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors"
              >
                {link.label}
                {link.external && <ExternalLink className="w-4 h-4" />}
              </Link>
            ))}
          </div>
        </div>

        {/* Eddy Images Reference */}
        <div className="mt-8 bg-neutral-800 border border-neutral-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Eddy Otter Images</h2>
          <p className="text-sm text-neutral-400 mb-4">
            Reference images used throughout the app for different conditions:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Green (Flowing)', key: 'green', url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png' },
              { name: 'Yellow (Caution)', key: 'yellow', url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png' },
              { name: 'Red (Warning)', key: 'red', url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png' },
              { name: 'Flag (Unknown)', key: 'flag', url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png' },
            ].map((img) => (
              <div key={img.key} className="text-center">
                <div className="bg-neutral-700 rounded-lg p-2 mb-2">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-20 h-20 mx-auto object-contain"
                  />
                </div>
                <p className="text-xs text-neutral-400">{img.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  alert,
  subtitle,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  alert?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
      <div className="flex items-center gap-2 text-neutral-400 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      {alert && (
        <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {alert}
        </p>
      )}
      {subtitle && !alert && (
        <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {subtitle}
        </p>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
