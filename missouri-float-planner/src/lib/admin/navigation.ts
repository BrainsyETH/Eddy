import type { AdminRole } from './permissions';

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Overview', icon: 'Home' }],
  },
  {
    label: 'Inbox',
    items: [
      {
        href: '/admin/feedback',
        label: 'Feedback & email',
        icon: 'Inbox',
        badge: 'pendingFeedback',
      },
      {
        href: '/admin/reports',
        label: 'Community reports',
        icon: 'MessageSquare',
      },
      {
        href: '/admin/float-contributions',
        label: 'Float contributions',
        icon: 'History',
      },
    ],
  },
  {
    label: 'Places & conditions',
    items: [
      {
        href: '/admin/access-points',
        label: 'Access points',
        icon: 'Navigation',
        badge: 'unapprovedAccessPoints',
      },
      { href: '/admin/pois', label: 'Points of interest', icon: 'Compass' },
      { href: '/admin/lakes', label: 'Lake launches', icon: 'Waves' },
      { href: '/admin/hazards', label: 'Hazards', icon: 'AlertTriangle' },
      { href: '/admin/gauges', label: 'Gauges', icon: 'Activity' },
      { href: '/admin/geography', label: 'Geography', icon: 'MapPin' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/blog', label: 'Blog & river guides', icon: 'FileText' },
      { href: '/admin/social', label: 'Social publishing', icon: 'Share2' },
      { href: '/admin/images', label: 'Images', icon: 'Image' },
      { href: '/admin/clips', label: 'Clips', icon: 'Film' },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/admin/trust',
        label: 'Data quality',
        icon: 'ShieldCheck',
        badge: 'openCriticalFindings',
      },
      {
        href: '/admin/operations',
        label: 'Jobs & incidents',
        icon: 'Activity',
      },
      { href: '/admin/data-sync', label: 'Data sync', icon: 'RefreshCw' },
      { href: '/admin/ai-models', label: 'AI settings', icon: 'Bot' },
      { href: '/admin/activity', label: 'Activity history', icon: 'History' },
      { href: '/admin/team', label: 'Team & access', icon: 'Users' },
    ],
  },
  {
    label: 'Help',
    items: [
      { href: '/admin/visuals', label: 'Visual guides', icon: 'BookOpen' },
    ],
  },
] as const;

export function adminNavActive(path: string, href: string) {
  return path === href || (href !== '/admin' && path.startsWith(href + '/'));
}

export function canVisitAdminPage(role: AdminRole, path: string) {
  if (role === 'owner') return true;
  if (path === '/admin' || path.startsWith('/admin/visuals')) return true;
  const areas =
    role === 'moderator'
      ? ['feedback', 'reports', 'float-contributions']
      : [
          'access-points',
          'pois',
          'lakes',
          'hazards',
          'gauges',
          'geography',
          'blog',
          'social',
          'images',
          'clips',
          'trust',
        ];
  return areas.some((area) => adminNavActive(path, '/admin/' + area));
}
