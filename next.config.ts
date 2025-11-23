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
};

export default nextConfig;
