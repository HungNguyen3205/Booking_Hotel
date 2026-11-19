import type { NextConfig } from 'next';

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const backend = (process.env.HOTEL_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: [...security, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
