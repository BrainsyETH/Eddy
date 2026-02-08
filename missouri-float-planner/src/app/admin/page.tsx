'use client';

// src/app/admin/page.tsx
// Admin dashboard landing page

import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { MapPin, Image as ImageIcon, ExternalLink, Navigation, Flag, FileText, Activity } from 'lucide-react';

const ADMIN_SECTIONS = [
  {
    title: 'Feedback',
    description: 'Review user-submitted feedback and data reports',
    href: '/admin/feedback',
    icon: Flag,
    color: 'bg-accent-500',
  },
  {
    title: 'Access Points',
    description: 'Manage access point images and details',
    href: '/admin/access-points',
    icon: Navigation,
    color: 'bg-teal-500',
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
    title: 'Image Library',
    description: 'Upload and manage images for rivers, access points, and more',
    href: '/admin/images',
    icon: ImageIcon,
    color: 'bg-purple-500',
  },
];

const QUICK_LINKS = [
  { label: 'View Site', href: '/', external: false },
  { label: 'Rivers', href: '/rivers', external: false },
  { label: 'River Levels', href: '/gauges', external: false },
];

export default function AdminDashboard() {
  return (
    <AdminLayout
      title="Dashboard"
      description="Manage your Eddy Float Planner data"
    >
      <div className="p-6 max-w-4xl mx-auto">
        {/* Admin Sections */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {ADMIN_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 hover:border-neutral-600 transition-colors group"
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
              { name: 'Green (Optimal)', key: 'green', url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png' },
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
