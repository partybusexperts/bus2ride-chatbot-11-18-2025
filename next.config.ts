import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'uxmiyfizeqbpeeikogre.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'partybusquotes.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.partybusquotes.com',
        pathname: '/**',
      },
    ],
  },
  allowedDevOrigins: [
    '1082a269-365d-4c7a-b6ee-cf4d9502e12c-00-1zbspbo4yykln.kirk.replit.dev',
    '7a4fd0a2-6b1c-4915-8d56-e3ba064c3663-00-pqow6flhli24.janeway.replit.dev',
    '127.0.0.1',
    'localhost',
  ],
};

export default nextConfig;
