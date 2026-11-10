export type AdminRole = 'owner' | 'editor' | 'moderator';
export interface AdminIdentity {
  id: string | null;
  name: string;
  role: AdminRole;
  legacy: boolean;
}

type Permission = readonly [path: string, methods: string];
const editorPermissions: Permission[] = [
  ['/api/admin/access-points/backfill-imagery', 'POST'],
  ['/api/admin/access-points', 'GET POST'],
  ['/api/admin/access-points/:id', 'GET PUT DELETE'],
  ['/api/admin/access-points/:id/approve', 'POST DELETE'],
  ['/api/admin/pois', 'GET POST'],
  ['/api/admin/pois/:id', 'GET PUT DELETE'],
  ['/api/admin/pois/:id/compute-mile', 'POST'],
  ['/api/admin/pois/:id/promote', 'POST'],
  ['/api/admin/lake-launches', 'GET'],
  ['/api/admin/lake-launches/:id', 'PATCH'],
  ['/api/admin/hazards', 'GET POST'],
  ['/api/admin/hazards/:id', 'GET PUT DELETE'],
  ['/api/admin/gauges', 'GET'],
  ['/api/admin/gauges/:id', 'GET PUT POST'],
  ['/api/admin/rivers', 'GET'],
  ['/api/admin/rivers/:id', 'PUT POST'],
  ['/api/admin/rivers/:id/visibility', 'PATCH'],
  ['/api/admin/blog', 'GET POST'],
  ['/api/admin/blog/:id', 'GET PUT DELETE'],
  ['/api/admin/images', 'GET POST'],
  ['/api/admin/images/:id', 'DELETE'],
  ['/api/admin/clips', 'GET PATCH'],
  ['/api/admin/clips/compile', 'POST'],
  ['/api/admin/clips/trigger-pipeline', 'POST'],
  ['/api/admin/clips/jobs/:id', 'GET'],
  ['/api/admin/clips/brand-check', 'POST'],
  ['/api/admin/clips/decide', 'GET'],
  ['/api/admin/clips/post', 'POST'],
  ['/api/admin/upload', 'POST'],
  ['/api/admin/upload-clip', 'GET POST'],
  ['/api/admin/upload-temp-video', 'GET POST DELETE'],
  ['/api/admin/parse-google-maps', 'POST'],
  ['/api/admin/social/config', 'GET'],
  ['/api/admin/social/health', 'GET'],
  ['/api/admin/social/posts', 'GET'],
  ['/api/admin/social/preflight', 'GET'],
  ['/api/admin/social/preview', 'GET'],
  ['/api/admin/social/tiktok/status', 'GET'],
  ['/api/admin/social/content', 'GET POST'],
  ['/api/admin/social/content/:id', 'PUT DELETE'],
  ['/api/admin/social/post-blog', 'POST'],
  ['/api/admin/social/publish', 'POST'],
  ['/api/admin/social/quick-post', 'POST'],
  ['/api/admin/social/retry', 'POST'],
  ['/api/admin/trust/findings', 'GET'],
  ['/api/admin/trust/review', 'GET'],
  ['/api/admin/trust/run', 'GET'],
];
const moderatorPermissions: Permission[] = [
  ['/api/feedback', 'GET'],
  ['/api/feedback/:id', 'PATCH'],
  ['/api/admin/feedback/:id', 'PATCH'],
  ['/api/admin/inbound-emails', 'GET'],
  ['/api/admin/inbound-emails/:id', 'PATCH'],
  ['/api/admin/inbound-emails/:id/reply', 'POST'],
  ['/api/admin/reports', 'GET PATCH'],
  ['/api/admin/reports/:id', 'GET PUT DELETE'],
  ['/api/admin/float-contributions', 'GET'],
];
const compile = (rules: Permission[]) =>
  rules.map(([path, methods]) => ({
    path: new RegExp(`^${path.replace(':id', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')}$`),
    methods: methods.split(' '),
  }));
const roles = {
  editor: compile(editorPermissions),
  moderator: compile(moderatorPermissions),
};

/** New actions require an explicit role grant; hiding a button is not authorization. */
export function adminPermission(
  role: AdminRole,
  path: string,
  method: string,
): boolean {
  if (role === 'owner') return true;
  const verb = method === 'HEAD' ? 'GET' : method;
  if (path === '/api/admin/session') return ['GET', 'DELETE'].includes(verb);
  if (
    verb === 'GET' &&
    (path === '/api/admin/stats' || /^\/admin\/visuals\/[^/]+$/.test(path))
  )
    return true;
  return roles[role].some(
    (rule) => rule.path.test(path) && rule.methods.includes(verb),
  );
}
