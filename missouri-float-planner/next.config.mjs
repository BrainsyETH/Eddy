/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'openweathermap.org',
      },
      {
        protocol: 'https',
        hostname: 'www.nps.gov',
      },
    ],
  },
};

export default nextConfig;
