// Canonical Next image optimizer allowlist. Used by config and blog rendering.
export const IMAGE_REMOTE_PATTERNS = [
      { protocol: 'https', hostname: 'cdn.recreation.gov', pathname: '/public/**' },
      { protocol: 'https', hostname: 'icampmo.usedirect.com', pathname: '/MSPWeb/images/Missouri/**' },
      { protocol: 'https', hostname: 'upload.wikimedia.org', port: '', pathname: '/wikipedia/commons/**' },
      { protocol: 'https', hostname: 'www.fws.gov', port: '', pathname: '/sites/default/files/**' },
      {
        protocol: 'https',
        hostname: 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'openweathermap.org',
        pathname: '/img/**',
      },
      {
        protocol: 'https',
        hostname: 'www.nps.gov',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        // Community-submitted river visual photos live in Supabase Storage.
        // Wildcard host so dev/preview/prod projects (different subdomains) all
        // resolve; scoped to the public storage path only.
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ];
