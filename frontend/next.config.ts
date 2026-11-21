import type { NextConfig } from 'next';

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// Preview: build riêng (NEXT_DIST_DIR) trỏ backend preview; luôn chặn lập chỉ mục.
const isPreview = process.env.NEXT_PUBLIC_PREVIEW === '1';

// Hosting chia sẻ (cPanel/CloudLinux) giới hạn số tiến trình: NEXT_BUILD_CPUS=1 để build không mở hàng chục worker (lỗi EAGAIN)
const buildCpus = Number(process.env.NEXT_BUILD_CPUS) || 0;

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  ...(buildCpus > 0 && { experimental: { cpus: buildCpus } }),
  poweredByHeader: false,
  // AVIF trước, WebP dự phòng: cùng chất lượng hiển thị, ít byte hơn (đo LCP: ảnh hero bị nghẽn băng thông)
  // NEXT_IMAGES_UNOPTIMIZED=1: máy chủ không chạy được sharp (glibc cũ) -> phục vụ thẳng ảnh WebP đã nén sẵn
  images: process.env.NEXT_IMAGES_UNOPTIMIZED === '1' ? { unoptimized: true } : { formats: ['image/avif', 'image/webp'] },
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
