import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/tra-cuu'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
