import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-api';

export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_PREVIEW === '1') return { rules: { userAgent: '*', disallow: '/' } }; // preview: không lập chỉ mục
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/tra-cuu'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
