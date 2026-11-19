import type { NextConfig } from 'next';

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// Preview: build riêng (NEXT_DIST_DIR) trỏ backend preview; luôn chặn lập chỉ mục.
const isPreview = process.env.NEXT_PUBLIC_PREVIEW === '1';

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // AVIF trước, WebP dự phòng: cùng chất lượng hiển thị, ít byte hơn (đo LCP: ảnh hero bị nghẽn băng thông)
  images: { formats: ['image/avif', 'image/webp'] },
  async rewrites() {
    const backend = (process.env.HOTEL_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: [...security, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, ...(isPreview ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : [])] },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
