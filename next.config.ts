import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'images.lumacdn.com' },
      { hostname: 'cdn.lu.ma' },
      { hostname: '*.supabase.co' },
      { hostname: '*.supabase.in' },
    ],
  },
};

export default nextConfig;
