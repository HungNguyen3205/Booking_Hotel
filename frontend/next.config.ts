import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const backend = (process.env.HOTEL_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

export default config;
